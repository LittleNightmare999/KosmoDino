import { useEffect, useState } from 'react'

export const STATUS_LABELS = {
  draft: 'Черновик',
  pending: 'На рецензии',
  published: 'Опубликована',
  rejected: 'Отклонена',
  archived: 'В архиве',
  visible: 'Видим',
  hidden: 'Скрыт',
}

export function StatusPill({ status }) {
  return <span className={`pill ${status}`}>{STATUS_LABELS[status] || status}</span>
}

// Пастельный оттенок для аватара: стабилен для одного имени
export function Avatar({ name }) {
  let h = 0
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360
  return (
    <span className="avatar" style={{ background: `hsl(${h} 38% 86%)` }} aria-hidden="true">
      {name.slice(0, 1).toUpperCase()}
    </span>
  )
}

export function formatDate(iso, withTime = false) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  })
}

export function plural(n, one, few, many) {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
}

export function formatEra(card, unit) {
  if (card.era_label) return card.era_label
  if (card.timeline_value == null) return ''
  return unit === 'год' ? `${card.timeline_value} г.` : `${Math.abs(card.timeline_value)} млн лет назад`
}

// Загрузка данных с состояниями «загрузка / ошибка / готово»
export function useAsync(fn, deps) {
  const [state, setState] = useState({ loading: true, error: null, data: null })
  useEffect(() => {
    let alive = true
    setState((s) => ({ ...s, loading: true, error: null }))
    fn()
      .then((data) => alive && setState({ loading: false, error: null, data }))
      .catch((error) => alive && setState({ loading: false, error, data: null }))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  const reload = () => fn().then((data) => setState({ loading: false, error: null, data }))
  return { ...state, reload, setData: (data) => setState((s) => ({ ...s, data })) }
}

export function Loader({ state, children, empty }) {
  if (state.loading && !state.data) return <p className="state">Загрузка…</p>
  if (state.error) return <p className="state">Не удалось загрузить данные: {state.error.message}</p>
  if (empty && empty(state.data)) return null
  return children(state.data)
}

export function useDocumentTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} — КосмоДино` : 'КосмоДино — энциклопедия'
  }, [title])
}
