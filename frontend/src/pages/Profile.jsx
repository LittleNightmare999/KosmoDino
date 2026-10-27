import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api.js'
import { ROLE_LABELS, useAuth } from '../auth.jsx'
import Glyph from '../components/Glyph.jsx'
import { Loader, formatDate, useAsync, useDocumentTitle } from '../components/common.jsx'

export default function Profile() {
  const { user } = useAuth()
  useDocumentTitle('Личный кабинет')
  const stats = useAsync(() => api.myStats(), [])
  const bookmarks = useAsync(() => api.bookmarks(), [])
  const attempts = useAsync(() => api.attempts(), [])

  const removeBookmark = async (slug) => {
    await api.bookmark(slug, false)
    bookmarks.setData(bookmarks.data.filter((b) => b.slug !== slug))
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{user.full_name || user.username}</h1>
          <p>
            {ROLE_LABELS[user.role]} · @{user.username} · с нами с {formatDate(user.created_at)}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Link className="btn primary" to="/quiz/space">
            Пройти викторину
          </Link>
          <Link className="btn quiet" to="/encyclopedia">
            К статьям
          </Link>
        </div>
      </div>

      <Loader state={stats}>
        {(s) => (
          <div className="kpis" aria-label="Моя активность">
            <div className="kpi">
              <div className="label">Закладки</div>
              <div className="value">{s.bookmarks}</div>
            </div>
            <div className="kpi">
              <div className="label">Комментарии</div>
              <div className="value">{s.comments}</div>
            </div>
            <div className="kpi">
              <div className="label">Пройдено викторин</div>
              <div className="value">{s.quiz_attempts}</div>
            </div>
            <div className="kpi">
              <div className="label">Верных ответов</div>
              <div className="value">{s.quiz_total ? `${Math.round((s.quiz_correct / s.quiz_total) * 100)} %` : '—'}</div>
              <div className="note">
                {s.quiz_correct} из {s.quiz_total}
              </div>
            </div>
          </div>
        )}
      </Loader>

      <div className="grid-2">
        <section className="panel" aria-labelledby="bm-title">
          <div className="panel-head">
            <h2 id="bm-title">Закладки</h2>
            <span className="small muted">{bookmarks.data?.length ?? 0}</span>
          </div>
          <Loader state={bookmarks}>
            {(items) =>
              items.length === 0 ? (
                <p className="panel-body muted">
                  Пока пусто. Нажмите «Добавить в закладки» на странице статьи, чтобы вернуться к ней позже.
                </p>
              ) : (
                <ul className="entries" style={{ padding: '0 18px' }}>
                  {items.map((a) => (
                    <li className="entry" key={a.id} style={{ gridTemplateColumns: '44px minmax(0,1fr) auto' }}>
                      <Glyph category={a.category_slug} size={44} />
                      <div>
                        <h3 style={{ fontSize: '1rem', marginBottom: 2 }}>
                          <Link to={`/article/${a.slug}`}>{a.title}</Link>
                        </h3>
                        <p className="small muted">{a.category_name}</p>
                      </div>
                      <button className="link-btn small" onClick={() => removeBookmark(a.slug)}>
                        Убрать
                      </button>
                    </li>
                  ))}
                </ul>
              )
            }
          </Loader>
        </section>

        <section className="panel" aria-labelledby="qa-title">
          <div className="panel-head">
            <h2 id="qa-title">Результаты викторин</h2>
          </div>
          <Loader state={attempts}>
            {(items) =>
              items.length === 0 ? (
                <p className="panel-body muted">Вы ещё не проходили викторины.</p>
              ) : (
                <table className="data">
                  <thead>
                    <tr>
                      <th>Дата</th>
                      <th>Раздел</th>
                      <th className="num">Результат</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((a) => (
                      <tr key={a.id}>
                        <td>{formatDate(a.created_at)}</td>
                        <td>{a.topic_name}</td>
                        <td className="num">
                          {a.score} / {a.total}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            }
          </Loader>
        </section>
      </div>

      <div className="grid-2">
        <ProfileForm />
        <PasswordForm />
      </div>
    </div>
  )
}

function ProfileForm() {
  const { user, refresh } = useAuth()
  const [form, setForm] = useState({ full_name: user.full_name, email: user.email })
  const [msg, setMsg] = useState(null)
  const submit = async (e) => {
    e.preventDefault()
    try {
      await api.updateMe(form)
      await refresh()
      setMsg({ ok: true, text: 'Профиль сохранён' })
    } catch (err) {
      setMsg({ ok: false, text: err.message })
    }
  }
  return (
    <section className="panel" aria-labelledby="pf-title">
      <div className="panel-head">
        <h2 id="pf-title">Профиль</h2>
      </div>
      <form className="form panel-body" onSubmit={submit}>
        <label className="field">
          Имя и фамилия
          <input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
        </label>
        <label className="field">
          Электронная почта
          <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
        </label>
        {msg && <p className={`alert${msg.ok ? ' ok' : ''}`}>{msg.text}</p>}
        <div>
          <button className="btn">Сохранить</button>
        </div>
      </form>
    </section>
  )
}

function PasswordForm() {
  const [form, setForm] = useState({ current_password: '', new_password: '' })
  const [msg, setMsg] = useState(null)
  const submit = async (e) => {
    e.preventDefault()
    try {
      await api.changePassword(form)
      setForm({ current_password: '', new_password: '' })
      setMsg({ ok: true, text: 'Пароль изменён' })
    } catch (err) {
      setMsg({ ok: false, text: err.message })
    }
  }
  return (
    <section className="panel" aria-labelledby="pw-title">
      <div className="panel-head">
        <h2 id="pw-title">Смена пароля</h2>
      </div>
      <form className="form panel-body" onSubmit={submit}>
        <label className="field">
          Текущий пароль
          <input type="password" value={form.current_password} autoComplete="current-password"
            onChange={(e) => setForm({ ...form, current_password: e.target.value })} required />
        </label>
        <label className="field">
          Новый пароль
          <input type="password" value={form.new_password} minLength={8} autoComplete="new-password"
            onChange={(e) => setForm({ ...form, new_password: e.target.value })} required />
        </label>
        {msg && <p className={`alert${msg.ok ? ' ok' : ''}`}>{msg.text}</p>}
        <div>
          <button className="btn">Изменить пароль</button>
        </div>
      </form>
    </section>
  )
}
