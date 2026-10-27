import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth.jsx'
import { useDocumentTitle } from '../components/common.jsx'

const DEMO = [
  ['alice', 'Администратор'],
  ['editor1', 'Редактор'],
  ['reader1', 'Читатель'],
]

function AuthShell({ title, children }) {
  return (
    <div className="auth-screen">
      <div className="auth-field">
        <h1>{title}</h1>
        <p style={{ maxWidth: '40ch' }}>
          Учётная запись нужна, чтобы сохранять статьи в закладки, обсуждать их и проходить викторины. Редакторы
          пишут статьи, администратор проверяет их перед публикацией.
        </p>
      </div>
      <div className="auth-form">{children}</div>
    </div>
  )
}

export function Login() {
  useDocumentTitle('Вход')
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [form, setForm] = useState({ username: '', password: '' })
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const user = await login(form.username.trim(), form.password)
      const fallback = user.role === 'admin' ? '/admin' : user.role === 'editor' ? '/editor' : '/me'
      navigate(location.state?.from || fallback, { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell title="Вход в энциклопедию">
      <form className="form" onSubmit={submit} aria-label="Вход">
        <h2>Вход</h2>
        <label className="field">
          Логин
          <input
            name="username"
            autoComplete="username"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            required
          />
        </label>
        <label className="field">
          Пароль
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
          />
        </label>
        {error && <p className="alert">{error}</p>}
        <div>
          <button className="btn primary" disabled={busy}>
            {busy ? 'Входим…' : 'Войти'}
          </button>
        </div>
        <p className="small muted">
          Нет учётной записи? <Link to="/register">Зарегистрируйтесь</Link>
        </p>
      </form>
      <div className="demo-accounts">
        Тестовые учётные записи (пароль password123):
        <div>
          {DEMO.map(([u, r]) => (
            <button key={u} type="button" className="btn small quiet" onClick={() => setForm({ username: u, password: '' })}>
              {u} — {r}
            </button>
          ))}
        </div>
      </div>
    </AuthShell>
  )
}

export function Register() {
  useDocumentTitle('Регистрация')
  const { register } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ username: '', email: '', full_name: '', password: '', confirm: '' })
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    if (form.password !== form.confirm) {
      setError('Пароли не совпадают')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const { confirm, ...data } = form
      await register(data)
      navigate('/me', { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell title="Регистрация читателя">
      <form className="form" onSubmit={submit} aria-label="Регистрация">
        <h2>Новая учётная запись</h2>
        <label className="field">
          Логин (латиница, цифры, точка, дефис)
          <input value={form.username} onChange={set('username')} pattern="[A-Za-z0-9_.\-]{3,40}" required autoComplete="username" />
        </label>
        <label className="field">
          Электронная почта
          <input type="email" value={form.email} onChange={set('email')} required autoComplete="email" />
        </label>
        <label className="field">
          Имя и фамилия
          <input value={form.full_name} onChange={set('full_name')} autoComplete="name" />
        </label>
        <div className="form-row">
          <label className="field">
            Пароль (не короче 8 символов)
            <input type="password" value={form.password} onChange={set('password')} minLength={8} required autoComplete="new-password" />
          </label>
          <label className="field">
            Повтор пароля
            <input type="password" value={form.confirm} onChange={set('confirm')} minLength={8} required autoComplete="new-password" />
          </label>
        </div>
        {error && <p className="alert">{error}</p>}
        <div>
          <button className="btn primary" disabled={busy}>
            {busy ? 'Создаём…' : 'Зарегистрироваться'}
          </button>
        </div>
        <p className="small muted">
          Уже есть учётная запись? <Link to="/login">Войдите</Link>
        </p>
      </form>
    </AuthShell>
  )
}
