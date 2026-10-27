import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { api } from '../../api.js'
import { ROLE_LABELS, useAuth } from '../../auth.jsx'
import { Pager } from '../Catalog.jsx'
import {
  Avatar,
  Loader,
  STATUS_LABELS,
  StatusPill,
  formatDate,
  useAsync,
  useDocumentTitle,
} from '../../components/common.jsx'

export function AdminLayout() {
  const [pending, setPending] = useState(null)
  useEffect(() => {
    api.adminArticles({ status: 'pending', page_size: 1 }).then((r) => setPending(r.total)).catch(() => {})
  }, [])
  const items = [
    ['/admin', 'Обзор', null, true],
    ['/admin/moderation', 'Рецензирование', pending],
    ['/admin/articles', 'Все статьи'],
    ['/admin/users', 'Пользователи'],
    ['/admin/comments', 'Комментарии'],
    ['/admin/categories', 'Категории'],
    ['/admin/audit', 'Журнал действий'],
  ]
  return (
    <div className="workspace">
      <nav className="sidenav" aria-label="Администрирование">
        <div className="scope">
          <strong>Администрирование</strong>
          КосмоДино
        </div>
        {items.map(([to, label, count, end]) => (
          <NavLink key={to} to={to} end={end}>
            {label}
            {count ? <span className="count">{count}</span> : null}
          </NavLink>
        ))}
      </nav>
      <div className="ws-main">
        <Outlet context={{ setPending }} />
      </div>
    </div>
  )
}

function Bars({ data, labels, highlight }) {
  const max = Math.max(1, ...Object.values(data))
  return (
    <div className="bars">
      {Object.entries(data).map(([k, v]) => (
        <div className="bar-row" key={k}>
          <span>{labels?.[k] || k}</span>
          <div className="bar-track">
            <div className={`bar-fill${highlight && highlight !== k ? ' muted' : ''}`} style={{ width: `${(v / max) * 100}%` }} />
          </div>
          <span className="num" style={{ textAlign: 'right' }}>
            {v}
          </span>
        </div>
      ))}
    </div>
  )
}

export function Overview() {
  useDocumentTitle('Администрирование')
  const stats = useAsync(() => api.adminStats(), [])
  const queue = useAsync(() => api.adminArticles({ status: 'pending', page_size: 5 }), [])
  return (
    <>
      <div className="page-head" style={{ marginBottom: 24 }}>
        <div>
          <h1>Обзор</h1>
          <p>Что ждёт решения администратора и как используется энциклопедия.</p>
        </div>
        <Link className="btn primary" to="/admin/moderation">
          Открыть очередь рецензирования
        </Link>
      </div>
      <Loader state={stats}>
        {(s) => (
          <>
            <div className="kpis">
              <div className="kpi">
                <div className="label">Ждут рецензии</div>
                <div className="value">{s.articles_by_status.pending || 0}</div>
                <div className="note">статей от редакторов</div>
              </div>
              <div className="kpi">
                <div className="label">Опубликовано</div>
                <div className="value">{s.articles_by_status.published || 0}</div>
                <div className="note">
                  {Object.entries(s.articles_by_topic)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(' · ')}
                </div>
              </div>
              <div className="kpi">
                <div className="label">Пользователи</div>
                <div className="value">{s.users_total}</div>
                <div className="note">
                  {Object.entries(s.users_by_role)
                    .map(([k, v]) => `${ROLE_LABELS[k]}: ${v}`)
                    .join(' · ')}
                </div>
              </div>
              <div className="kpi">
                <div className="label">Комментарии</div>
                <div className="value">{s.comments_total}</div>
                <div className="note">скрыто модератором: {s.comments_hidden}</div>
              </div>
            </div>
            <div className="grid-2">
              <section className="panel">
                <div className="panel-head">
                  <h2>Очередь рецензирования</h2>
                  <Link className="small" to="/admin/moderation">
                    Все
                  </Link>
                </div>
                <Loader state={queue}>
                  {(q) =>
                    q.items.length === 0 ? (
                      <p className="panel-body muted">Очередь пуста — все статьи рассмотрены.</p>
                    ) : (
                      q.items.map((a) => (
                        <div className="queue-item" key={a.id}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                            <Link to={`/article/${a.slug}`} style={{ fontWeight: 500 }}>
                              {a.title}
                            </Link>
                            <span className="small muted">{formatDate(a.updated_at)}</span>
                          </div>
                          <p className="small muted">{a.summary}</p>
                        </div>
                      ))
                    )
                  }
                </Loader>
              </section>
              <section className="panel">
                <div className="panel-head">
                  <h2>Статьи по состояниям</h2>
                </div>
                <div className="panel-body">
                  <Bars data={s.articles_by_status} labels={STATUS_LABELS} highlight="pending" />
                </div>
              </section>
            </div>
            <section className="panel">
              <div className="panel-head">
                <h2>Самые читаемые статьи</h2>
                <span className="small muted">
                  закладок всего: {s.bookmarks_total} · попыток викторин: {s.quiz_attempts}
                </span>
              </div>
              <table className="data">
                <thead>
                  <tr>
                    <th>Статья</th>
                    <th>Категория</th>
                    <th className="num">Просмотры</th>
                  </tr>
                </thead>
                <tbody>
                  {s.top_articles.map((a) => (
                    <tr key={a.id}>
                      <td>
                        <Link to={`/article/${a.slug}`}>{a.title}</Link>
                      </td>
                      <td>{a.category_name}</td>
                      <td className="num">{a.views}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </>
        )}
      </Loader>
    </>
  )
}

export function Moderation() {
  useDocumentTitle('Рецензирование')
  const state = useAsync(() => api.adminArticles({ status: 'pending', page_size: 50 }), [])
  const [notes, setNotes] = useState({})
  const [msg, setMsg] = useState(null)

  const decide = async (a, approve) => {
    setMsg(null)
    try {
      await api.review(a.slug, approve, notes[a.slug] || '')
      state.setData({ ...state.data, items: state.data.items.filter((x) => x.id !== a.id), total: state.data.total - 1 })
      setMsg({ ok: true, text: approve ? `«${a.title}» опубликована.` : `«${a.title}» возвращена автору.` })
    } catch (e) {
      setMsg({ ok: false, text: e.message })
    }
  }

  return (
    <>
      <div className="page-head" style={{ marginBottom: 24 }}>
        <div>
          <h1>Рецензирование</h1>
          <p>Статьи, отправленные редакторами. Отклонение требует замечания — его увидит автор.</p>
        </div>
      </div>
      {msg && <p className={`alert${msg.ok ? ' ok' : ''}`} style={{ marginBottom: 16 }}>{msg.text}</p>}
      <Loader state={state}>
        {(data) =>
          data.items.length === 0 ? (
            <p className="state">Нет статей, ожидающих рецензии.</p>
          ) : (
            <div className="panel">
              {data.items.map((a) => (
                <div className="queue-item" key={a.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div>
                      <Link to={`/article/${a.slug}`} style={{ fontWeight: 600, fontSize: '1.0625rem' }}>
                        {a.title}
                      </Link>
                      <p className="small muted">
                        {a.category_name} · изменена {formatDate(a.updated_at, true)}
                      </p>
                    </div>
                    <div className="row-actions">
                      <button className="btn small primary" onClick={() => decide(a, true)}>
                        Опубликовать
                      </button>
                      <button className="btn small danger" onClick={() => decide(a, false)}>
                        Отклонить
                      </button>
                    </div>
                  </div>
                  <p>{a.summary}</p>
                  <input
                    aria-label={`Замечание к статье ${a.title}`}
                    placeholder="Замечание для автора (обязательно при отклонении)"
                    value={notes[a.slug] || ''}
                    onChange={(e) => setNotes({ ...notes, [a.slug]: e.target.value })}
                  />
                </div>
              ))}
            </div>
          )
        }
      </Loader>
    </>
  )
}

export function Articles() {
  useDocumentTitle('Все статьи')
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const state = useAsync(() => api.adminArticles({ status, q, page, page_size: 20 }), [status, q, page])
  const [error, setError] = useState(null)

  const act = async (fn) => {
    setError(null)
    try {
      await fn()
      state.reload()
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <>
      <div className="page-head" style={{ marginBottom: 20 }}>
        <div>
          <h1>Все статьи</h1>
          <p>Опубликованную статью можно убрать в архив; удалить можно только неопубликованную.</p>
        </div>
      </div>
      <div className="toolbar">
        <input aria-label="Поиск по заголовку" placeholder="Поиск по заголовку" value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} />
        <div className="segmented" role="group" aria-label="Состояние">
          {['', 'published', 'pending', 'draft', 'rejected', 'archived'].map((s) => (
            <button key={s} className={status === s ? 'active' : ''} onClick={() => { setStatus(s); setPage(1) }}>
              {s ? STATUS_LABELS[s] : 'Все'}
            </button>
          ))}
        </div>
      </div>
      {error && <p className="alert" style={{ marginBottom: 12 }}>{error}</p>}
      <Loader state={state}>
        {(data) => (
          <>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Статья</th>
                    <th>Раздел</th>
                    <th>Состояние</th>
                    <th>Изменена</th>
                    <th className="num">Просмотры</th>
                    <th className="num">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((a) => (
                    <tr key={a.id}>
                      <td>
                        <Link to={`/article/${a.slug}`}>{a.title}</Link>
                      </td>
                      <td>{a.topic_slug === 'space' ? 'Космос' : 'Динозавры'} · {a.category_name}</td>
                      <td>
                        <StatusPill status={a.status} />
                      </td>
                      <td className="nowrap">{formatDate(a.updated_at)}</td>
                      <td className="num">{a.views}</td>
                      <td>
                        <div className="row-actions">
                          <Link className="btn small quiet" to={`/editor/${a.slug}`}>
                            Править
                          </Link>
                          {a.status === 'published' && (
                            <button className="btn small quiet" onClick={() => act(() => api.archive(a.slug))}>
                              В архив
                            </button>
                          )}
                          {a.status === 'archived' && (
                            <button className="btn small quiet" onClick={() => act(() => api.restore(a.slug))}>
                              Вернуть
                            </button>
                          )}
                          {a.status !== 'published' && (
                            <button
                              className="btn small danger"
                              onClick={() => window.confirm(`Удалить «${a.title}» без возможности восстановления?`) && act(() => api.deleteArticle(a.slug))}
                            >
                              Удалить
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager page={data.page} size={data.page_size} total={data.total} onPage={setPage} />
          </>
        )}
      </Loader>
    </>
  )
}

export function Users() {
  useDocumentTitle('Пользователи')
  const { user: me } = useAuth()
  const [q, setQ] = useState('')
  const [role, setRole] = useState('')
  const [page, setPage] = useState(1)
  const state = useAsync(() => api.adminUsers({ q, role, page, page_size: 20 }), [q, role, page])
  const [error, setError] = useState(null)

  const update = async (u, patch) => {
    setError(null)
    try {
      const nu = await api.updateUser(u.id, patch)
      state.setData({ ...state.data, items: state.data.items.map((x) => (x.id === u.id ? nu : x)) })
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <>
      <div className="page-head" style={{ marginBottom: 20 }}>
        <div>
          <h1>Пользователи</h1>
          <p>Назначение ролей и блокировка учётных записей. Собственную учётную запись понизить нельзя.</p>
        </div>
      </div>
      <div className="toolbar">
        <input aria-label="Поиск пользователя" placeholder="Логин, имя или почта" value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} />
        <select aria-label="Роль" value={role} onChange={(e) => { setRole(e.target.value); setPage(1) }}>
          <option value="">Все роли</option>
          {Object.entries(ROLE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>
      {error && <p className="alert" style={{ marginBottom: 12 }}>{error}</p>}
      <Loader state={state}>
        {(data) => (
          <>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Пользователь</th>
                    <th>Почта</th>
                    <th>Роль</th>
                    <th>Последний вход</th>
                    <th className="num">Доступ</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <span style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}>
                          <Avatar name={u.full_name || u.username} />
                          <span>
                            {u.full_name || '—'}
                            <span className="muted small"> @{u.username}</span>
                          </span>
                        </span>
                      </td>
                      <td>{u.email}</td>
                      <td>
                        <select
                          aria-label={`Роль ${u.username}`}
                          value={u.role}
                          disabled={u.id === me.id}
                          onChange={(e) => update(u, { role: e.target.value })}
                          style={{ minHeight: 34, padding: '4px 8px', width: 'auto' }}
                        >
                          {Object.entries(ROLE_LABELS).map(([k, v]) => (
                            <option key={k} value={k}>
                              {v}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="nowrap">{u.last_login_at ? formatDate(u.last_login_at, true) : '—'}</td>
                      <td>
                        <div className="row-actions">
                          {u.is_active ? (
                            <button className="btn small quiet" disabled={u.id === me.id} onClick={() => update(u, { is_active: false })}>
                              Заблокировать
                            </button>
                          ) : (
                            <button className="btn small danger" onClick={() => update(u, { is_active: true })}>
                              Разблокировать
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager page={data.page} size={data.page_size} total={data.total} onPage={setPage} />
          </>
        )}
      </Loader>
    </>
  )
}

export function Comments() {
  useDocumentTitle('Комментарии')
  const [status, setStatus] = useState('')
  const state = useAsync(() => api.adminComments(status || undefined), [status])

  const moderate = async (c, s) => {
    await api.moderateComment(c.id, s)
    state.reload()
  }
  const remove = async (c) => {
    if (!window.confirm('Удалить комментарий?')) return
    await api.deleteComment(c.id)
    state.reload()
  }

  return (
    <>
      <div className="page-head" style={{ marginBottom: 20 }}>
        <div>
          <h1>Комментарии</h1>
          <p>Скрытые комментарии не видны читателям, но остаются в базе для истории модерации.</p>
        </div>
        <div className="segmented" role="group" aria-label="Фильтр">
          {[
            ['', 'Все'],
            ['visible', 'Видимые'],
            ['hidden', 'Скрытые'],
          ].map(([v, l]) => (
            <button key={v} className={status === v ? 'active' : ''} onClick={() => setStatus(v)}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <Loader state={state}>
        {(items) => (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Комментарий</th>
                  <th>Автор</th>
                  <th>Статья</th>
                  <th>Состояние</th>
                  <th className="num">Действия</th>
                </tr>
              </thead>
              <tbody>
                {items.map((c) => (
                  <tr key={c.id}>
                    <td style={{ maxWidth: 420 }}>
                      {c.body}
                      <div className="small muted">{formatDate(c.created_at, true)}</div>
                    </td>
                    <td>@{c.user.username}</td>
                    <td>
                      <Link to={`/article/${c.article_slug}`}>{c.article_title}</Link>
                    </td>
                    <td>
                      <StatusPill status={c.status} />
                    </td>
                    <td>
                      <div className="row-actions">
                        {c.status === 'visible' ? (
                          <button className="btn small quiet" onClick={() => moderate(c, 'hidden')}>
                            Скрыть
                          </button>
                        ) : (
                          <button className="btn small quiet" onClick={() => moderate(c, 'visible')}>
                            Показать
                          </button>
                        )}
                        <button className="btn small danger" onClick={() => remove(c)}>
                          Удалить
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Loader>
    </>
  )
}

export function Categories() {
  useDocumentTitle('Категории')
  const state = useAsync(() => api.topics(), [])
  const [form, setForm] = useState({ topic_id: '', slug: '', name: '', description: '' })
  const [msg, setMsg] = useState(null)

  const create = async (e) => {
    e.preventDefault()
    setMsg(null)
    try {
      await api.createCategory({ ...form, topic_id: Number(form.topic_id) })
      setForm({ ...form, slug: '', name: '', description: '' })
      state.reload()
    } catch (err) {
      setMsg(err.message)
    }
  }
  const remove = async (c) => {
    setMsg(null)
    try {
      await api.deleteCategory(c.id)
      state.reload()
    } catch (err) {
      setMsg(err.message)
    }
  }

  return (
    <>
      <div className="page-head" style={{ marginBottom: 20 }}>
        <div>
          <h1>Категории</h1>
          <p>Справочник категорий разделов. Категорию со статьями удалить нельзя.</p>
        </div>
      </div>
      {msg && <p className="alert" style={{ marginBottom: 12 }}>{msg}</p>}
      <div className="split">
        <Loader state={state}>
          {(topics) => (
            <div style={{ display: 'grid', gap: 24 }}>
              {topics.map((t) => (
                <section className="panel" key={t.id}>
                  <div className="panel-head">
                    <h2>{t.name}</h2>
                    <span className="small muted">{t.article_count} опубликованных статей</span>
                  </div>
                  <table className="data">
                    <tbody>
                      {t.categories.map((c) => (
                        <tr key={c.id}>
                          <td>
                            <Link to={`/topic/${t.slug}?category=${c.slug}`}>{c.name}</Link>
                            <div className="small muted">{c.description}</div>
                          </td>
                          <td className="muted small">{c.slug}</td>
                          <td>
                            <div className="row-actions">
                              <button className="btn small quiet" onClick={() => remove(c)}>
                                Удалить
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              ))}
            </div>
          )}
        </Loader>
        <section className="panel">
          <div className="panel-head">
            <h2>Новая категория</h2>
          </div>
          <form className="form panel-body" onSubmit={create}>
            <label className="field">
              Раздел
              <select value={form.topic_id} onChange={(e) => setForm({ ...form, topic_id: e.target.value })} required>
                <option value="">Выберите</option>
                {(state.data || []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Название
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required minLength={2} />
            </label>
            <label className="field">
              Адрес (латиница)
              <input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} pattern="[a-z0-9\-]{2,60}" required />
            </label>
            <label className="field">
              Описание
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} style={{ minHeight: 80 }} />
            </label>
            <div>
              <button className="btn primary">Добавить</button>
            </div>
          </form>
        </section>
      </div>
    </>
  )
}

const ACTION_LABELS = {
  'article.create': 'Создание статьи',
  'article.update': 'Правка статьи',
  'article.pending': 'Отправка на рецензию',
  'article.published': 'Публикация',
  'article.rejected': 'Отклонение',
  'article.archived': 'Архивирование',
  'article.delete': 'Удаление статьи',
  'user.register': 'Регистрация',
  'user.update': 'Изменение пользователя',
  'comment.hidden': 'Скрытие комментария',
  'comment.visible': 'Показ комментария',
  'comment.delete': 'Удаление комментария',
  'category.create': 'Новая категория',
  'category.delete': 'Удаление категории',
  'link.create': 'Новая связь',
}

export function Audit() {
  useDocumentTitle('Журнал действий')
  const state = useAsync(() => api.audit(200), [])
  return (
    <>
      <div className="page-head" style={{ marginBottom: 20 }}>
        <div>
          <h1>Журнал действий</h1>
          <p>Последние 200 событий: кто, что и когда изменил в системе.</p>
        </div>
      </div>
      <Loader state={state}>
        {(items) => (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Время</th>
                  <th>Пользователь</th>
                  <th>Действие</th>
                  <th>Подробности</th>
                </tr>
              </thead>
              <tbody>
                {items.map((e) => (
                  <tr key={e.id}>
                    <td className="nowrap">{formatDate(e.created_at, true)}</td>
                    <td>{e.actor ? `@${e.actor.username}` : '—'}</td>
                    <td>{ACTION_LABELS[e.action] || e.action}</td>
                    <td>{e.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Loader>
    </>
  )
}
