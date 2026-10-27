import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api.js'
import { useAuth } from '../auth.jsx'
import RichText from '../components/RichText.jsx'
import { Avatar, Loader, StatusPill, formatDate, useAsync, useDocumentTitle } from '../components/common.jsx'

export default function Article() {
  const { slug } = useParams()
  const state = useAsync(() => api.article(slug), [slug])
  return (
    <Loader state={state}>
      {(a) => <ArticleView a={a} onChange={(patch) => state.setData({ ...a, ...patch })} />}
    </Loader>
  )
}

function ArticleView({ a, onChange }) {
  const { user, can } = useAuth()
  const [msg, setMsg] = useState(null)
  useDocumentTitle(a.title)
  const topicName = a.topic_slug === 'space' ? 'Космос' : 'Динозавры'
  const canEdit = can('admin') || (can('editor') && a.author?.id === user?.id)

  const toggleBookmark = async () => {
    try {
      await api.bookmark(a.slug, !a.bookmarked)
      onChange({ bookmarked: !a.bookmarked })
    } catch (e) {
      setMsg(e.message)
    }
  }

  const outgoing = a.links.filter((l) => l.direction === 'out')
  const incoming = a.links.filter((l) => l.direction === 'in')

  return (
    <article data-topic={a.topic_slug}>
      <header className="article-head">
        <div className="article-head-inner">
          <nav className="crumbs" aria-label="Путь">
            <Link to="/encyclopedia">Энциклопедия</Link>
            <span aria-hidden="true">/</span>
            <Link to={`/topic/${a.topic_slug}`}>{topicName}</Link>
            <span aria-hidden="true">/</span>
            <Link to={`/topic/${a.topic_slug}?category=${a.category_slug}`}>{a.category_name}</Link>
          </nav>
          <h1>{a.title}</h1>
          <p className="lead">{a.summary}</p>
          <div className="article-actions">
            {a.status !== 'published' && <StatusPill status={a.status} />}
            {user ? (
              <button className="btn" onClick={toggleBookmark} aria-pressed={a.bookmarked}>
                {a.bookmarked ? 'В закладках' : 'Добавить в закладки'}
              </button>
            ) : (
              <Link className="btn" to="/login" state={{ from: `/article/${a.slug}` }}>
                Войти, чтобы сохранить
              </Link>
            )}
            {a.quiz_count > 0 && (
              <Link className="btn quiet" to={`/quiz/${a.topic_slug}`}>
                Викторина раздела
              </Link>
            )}
            {canEdit && (
              <Link className="btn quiet" to={`/editor/${a.slug}`}>
                Редактировать
              </Link>
            )}
            <span className="muted small">
              {a.views} просмотров · обновлено {formatDate(a.updated_at)}
            </span>
          </div>
          {msg && <p className="alert">{msg}</p>}
          {a.review_note && (
            <p className="alert" style={{ marginTop: 20 }}>
              Замечание рецензента: {a.review_note}
            </p>
          )}
        </div>
      </header>

      <div className="article-body">
        <div>
          <RichText source={a.content} />
          <Comments slug={a.slug} enabled={a.status === 'published'} />
        </div>

        <aside className="aside">
          {a.facts.length > 0 && (
            <section className="factbox" aria-labelledby="facts-title">
              <h2 className="factbox-title" id="facts-title">
                Карточка фактов
              </h2>
              <dl>
                {a.facts.map((f, i) => (
                  <div className="row" key={i}>
                    <dt>{f.label}</dt>
                    <dd>{f.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
          {outgoing.length + incoming.length > 0 && (
            <section className="side-block" aria-labelledby="links-title">
              <h2 id="links-title">Связи в энциклопедии</h2>
              <ul className="relations">
                {[...outgoing, ...incoming].map((l) => (
                  <li key={`${l.direction}-${l.slug}`}>
                    <Link to={`/article/${l.slug}`}>{l.title}</Link>
                    <span className="rel">{l.direction === 'out' ? l.relation : `← ${l.relation}`}</span>
                  </li>
                ))}
              </ul>
              <p className="small" style={{ marginTop: 10 }}>
                <Link to={`/graph?focus=${a.slug}`}>Показать на графе связей</Link>
              </p>
            </section>
          )}
          {a.tags.length > 0 && (
            <section className="side-block" aria-labelledby="tags-title">
              <h2 id="tags-title">Теги</h2>
              <div className="tag-cloud">
                {a.tags.map((t) => (
                  <Link key={t} className="tag" to={`/encyclopedia?tag=${encodeURIComponent(t)}`}>
                    {t}
                  </Link>
                ))}
              </div>
            </section>
          )}
          {a.author && (
            <p className="small muted">
              Автор статьи: {a.author.full_name || a.author.username}
              {a.published_at && <>, опубликована {formatDate(a.published_at)}</>}
            </p>
          )}
        </aside>
      </div>
    </article>
  )
}

function Comments({ slug, enabled }) {
  const { user, can } = useAuth()
  const state = useAsync(() => (enabled ? api.comments(slug) : Promise.resolve([])), [slug, enabled])
  const [body, setBody] = useState('')
  const [error, setError] = useState(null)
  if (!enabled) return null

  const submit = async (e) => {
    e.preventDefault()
    setError(null)
    try {
      const c = await api.addComment(slug, body)
      state.setData([c, ...(state.data || [])])
      setBody('')
    } catch (err) {
      setError(err.message)
    }
  }

  const remove = async (id) => {
    await api.deleteComment(id)
    state.setData(state.data.filter((c) => c.id !== id))
  }

  return (
    <section className="comments" aria-labelledby="comments-title">
      <h2 id="comments-title">Обсуждение</h2>
      {user ? (
        <form className="form" onSubmit={submit} style={{ marginBottom: 12 }}>
          <label className="field">
            Ваш комментарий
            <textarea value={body} onChange={(e) => setBody(e.target.value)} minLength={2} maxLength={2000} required />
          </label>
          {error && <p className="alert">{error}</p>}
          <div>
            <button className="btn primary" disabled={body.trim().length < 2}>
              Отправить
            </button>
          </div>
        </form>
      ) : (
        <p className="muted">
          <Link to="/login">Войдите</Link>, чтобы участвовать в обсуждении.
        </p>
      )}
      <Loader state={state}>
        {(items) =>
          items.length === 0 ? (
            <p className="muted" style={{ paddingTop: 12 }}>
              Комментариев пока нет.
            </p>
          ) : (
            items.map((c) => (
              <div className="comment" key={c.id}>
                <div className="comment-meta">
                  <Avatar name={c.user.full_name || c.user.username} />
                  <strong style={{ color: 'var(--ink)', fontWeight: 500 }}>{c.user.full_name || c.user.username}</strong>
                  <span>{formatDate(c.created_at, true)}</span>
                  {(user?.id === c.user.id || can('admin')) && (
                    <button className="link-btn small" onClick={() => remove(c.id)}>
                      Удалить
                    </button>
                  )}
                </div>
                <p>{c.body}</p>
              </div>
            ))
          )
        }
      </Loader>
    </section>
  )
}
