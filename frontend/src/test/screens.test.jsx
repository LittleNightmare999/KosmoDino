import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider, RequireRole } from '../auth.jsx'
import { Login } from '../pages/Auth.jsx'
import Quiz from '../pages/Quiz.jsx'

// Подменяем fetch: маршрут → ответ сервера
function mockFetch(routes) {
  const fn = vi.fn(async (url, opts = {}) => {
    const key = `${opts.method || 'GET'} ${url.split('?')[0]}`
    const handler = routes[key]
    if (!handler) return { ok: false, status: 404, json: async () => ({ detail: 'нет маршрута' }) }
    const [status, body] = typeof handler === 'function' ? handler(opts) : handler
    return { ok: status < 400, status, json: async () => body }
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

afterEach(() => vi.unstubAllGlobals())

const ALICE = { id: 1, username: 'alice', full_name: 'Алиса', email: 'a@x', role: 'admin', is_active: true, created_at: '2026-01-01' }
const READER = { ...ALICE, id: 2, username: 'reader1', role: 'reader' }

function renderAt(path, element, routePath = '*') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route path={routePath} element={element} />
          <Route path="/login" element={<p>Страница входа</p>} />
          <Route path="/admin" element={<p>Панель администратора</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('вход в систему', () => {
  it('отправляет логин и пароль и переводит администратора в панель', async () => {
    const fetch = mockFetch({ 'POST /api/auth/login': [200, { access_token: 'tok', user: ALICE }] })
    renderAt('/login', <Login />, '/login')
    await userEvent.type(screen.getByLabelText('Логин'), 'alice')
    await userEvent.type(screen.getByLabelText('Пароль'), 'password123')
    await userEvent.click(screen.getByRole('button', { name: 'Войти' }))
    expect(await screen.findByText('Панель администратора')).toBeInTheDocument()
    const body = JSON.parse(fetch.mock.calls[0][1].body)
    expect(body).toEqual({ username: 'alice', password: 'password123' })
    expect(localStorage.getItem('cosmodino.token')).toBe('tok')
  })

  it('показывает ошибку сервера при неверном пароле', async () => {
    mockFetch({ 'POST /api/auth/login': [401, { detail: 'Неверный логин или пароль' }] })
    renderAt('/login', <Login />, '/login')
    await userEvent.type(screen.getByLabelText('Логин'), 'alice')
    await userEvent.type(screen.getByLabelText('Пароль'), 'bad')
    await userEvent.click(screen.getByRole('button', { name: 'Войти' }))
    expect(await screen.findByText('Неверный логин или пароль')).toBeInTheDocument()
  })
})

describe('разграничение доступа на клиенте', () => {
  it('гостя отправляет на страницу входа', async () => {
    mockFetch({})
    renderAt('/secret', <RequireRole roles={['admin']}><p>Секрет</p></RequireRole>)
    expect(await screen.findByText('Страница входа')).toBeInTheDocument()
  })

  it('читателю не показывает раздел администратора', async () => {
    localStorage.setItem('cosmodino.token', 'tok')
    mockFetch({ 'GET /api/auth/me': [200, READER] })
    renderAt('/secret', <RequireRole roles={['admin']}><p>Секрет</p></RequireRole>)
    expect(await screen.findByText('Нет доступа')).toBeInTheDocument()
    expect(screen.queryByText('Секрет')).not.toBeInTheDocument()
  })

  it('администратору показывает раздел', async () => {
    localStorage.setItem('cosmodino.token', 'tok')
    mockFetch({ 'GET /api/auth/me': [200, ALICE] })
    renderAt('/secret', <RequireRole roles={['admin']}><p>Секрет</p></RequireRole>)
    expect(await screen.findByText('Секрет')).toBeInTheDocument()
  })
})

describe('викторина', () => {
  const questions = [
    { id: 10, question: 'Сколько спутников у Марса?', options: ['Ни одного', 'Два'], article_slug: 'mars', article_title: 'Марс' },
    { id: 11, question: 'Самая горячая планета?', options: ['Венера', 'Меркурий'], article_slug: 'venus', article_title: 'Венера' },
  ]

  it('проверяет ответы только после выбора всех вариантов и показывает счёт', async () => {
    localStorage.setItem('cosmodino.token', 'tok')
    const fetch = mockFetch({
      'GET /api/auth/me': [200, READER],
      'GET /api/quiz/space': [200, questions],
      'POST /api/quiz/submit': [200, {
        score: 1, total: 2,
        items: [
          { question_id: 10, correct: true, correct_index: 1, explanation: 'Фобос и Деймос.' },
          { question_id: 11, correct: false, correct_index: 0, explanation: 'Парниковый эффект.' },
        ],
      }],
    })
    renderAt('/quiz/space', <Quiz />, '/quiz/:topic')
    await screen.findByText('Сколько спутников у Марса?')
    const check = await screen.findByRole('button', { name: 'Проверить ответы' })
    expect(check).toBeDisabled()

    await userEvent.click(screen.getByRole('radio', { name: /Два/ }))
    await userEvent.click(screen.getByRole('radio', { name: /Меркурий/ }))
    expect(check).toBeEnabled()
    await userEvent.click(check)

    expect(await screen.findByText('1 из 2')).toBeInTheDocument()
    expect(screen.getByText('Фобос и Деймос.')).toBeInTheDocument()
    const submitCall = fetch.mock.calls.find(([u, o]) => u.startsWith('/api/quiz/submit') && o.method === 'POST')
    expect(JSON.parse(submitCall[1].body).answers).toEqual([
      { question_id: 10, selected_index: 1 },
      { question_id: 11, selected_index: 1 },
    ])
  })

  it('гостю предлагает войти вместо проверки', async () => {
    mockFetch({ 'GET /api/quiz/space': [200, questions] })
    renderAt('/quiz/space', <Quiz />, '/quiz/:topic')
    expect(await screen.findByRole('link', { name: 'Войти, чтобы проверить ответы' })).toBeInTheDocument()
  })
})
