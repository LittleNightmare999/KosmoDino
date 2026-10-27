import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../../api.js'
import RichText from '../../components/RichText.jsx'
import { StatusPill, formatDate, useDocumentTitle } from '../../components/common.jsx'

const EMPTY = {
  title: '',
  slug: '',
  summary: '',
  content: '## Раздел\n',
  category_id: '',
  era_label: '',
  timeline_value: '',
  facts: [{ label: '', value: '' }],
  tags: '',
  revision_comment: '',
}

const TRANSLIT = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm',
  н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
}

export function slugify(title) {
  return title
    .toLowerCase()
    .split('')
    .map((c) => TRANSLIT[c] ?? c)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
}

export default function ArticleEditor() {
  const { slug } = useParams()
  const isNew = !slug
  const navigate = useNavigate()
  const [topics, setTopics] = useState([])
  const [form, setForm] = useState(EMPTY)
  const [article, setArticle] = useState(null)
  const [msg, setMsg] = useState(null)
  const [preview, setPreview] = useState(false)
  const [slugTouched, setSlugTouched] = useState(!isNew)
  useDocumentTitle(isNew ? 'Новая статья' : `Правка: ${form.title}`)

  useEffect(() => {
    api.topics().then(setTopics)
  }, [])

  useEffect(() => {
    if (isNew) return
    api.article(slug).then((a) => {
      setArticle(a)
      setForm({
        title: a.title,
        slug: a.slug,
        summary: a.summary,
        content: a.content,
        category_id: a.category_id,
        era_label: a.era_label,
        timeline_value: a.timeline_value ?? '',
        facts: a.facts.length ? a.facts : [{ label: '', value: '' }],
        tags: a.tags.join(', '),
        revision_comment: '',
      })
    })
  }, [slug, isNew])

  const set = (k) => (e) => {
    const value = e.target.value
    setForm((f) => ({ ...f, [k]: value, ...(k === 'title' && !slugTouched ? { slug: slugify(value) } : {}) }))
  }

  const setFact = (i, k, v) => setForm((f) => ({ ...f, facts: f.facts.map((x, j) => (j === i ? { ...x, [k]: v } : x)) }))

  const payload = () => ({
    ...form,
    category_id: Number(form.category_id),
    timeline_value: form.timeline_value === '' ? null : Number(form.timeline_value),
    facts: form.facts.filter((f) => f.label.trim() && f.value.trim()),
    tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
  })

  const save = async (e) => {
    e.preventDefault()
    setMsg(null)
    try {
      const a = isNew ? await api.createArticle(payload()) : await api.updateArticle(slug, payload())
      setArticle(a)
      setMsg({ ok: true, text: `Сохранено. Состояние: ${a.status === 'pending' ? 'на рецензии' : a.status === 'draft' ? 'черновик' : 'опубликована'}.` })
      if (isNew || a.slug !== slug) navigate(`/editor/${a.slug}`, { replace: true })
    } catch (err) {
      setMsg({ ok: false, text: err.message })
    }
  }

  const submit = async () => {
    try {
      const a = await api.submitArticle(article.slug)
      setArticle(a)
      setMsg({ ok: true, text: 'Статья отправлена на рецензию администратору.' })
    } catch (err) {
      setMsg({ ok: false, text: err.message })
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p className="small">
            <Link to="/editor">Мои статьи</Link>
          </p>
          <h1>{isNew ? 'Новая статья' : form.title || 'Статья'}</h1>
          {article && (
            <p>
              <StatusPill status={article.status} /> обновлена {formatDate(article.updated_at, true)}
            </p>
          )}
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button className="btn quiet" type="button" onClick={() => setPreview((v) => !v)}>
            {preview ? 'Вернуться к тексту' : 'Предпросмотр'}
          </button>
          {article && ['draft', 'rejected'].includes(article.status) && (
            <button className="btn primary" type="button" onClick={submit}>
              Отправить на рецензию
            </button>
          )}
          {article?.status === 'published' && (
            <Link className="btn quiet" to={`/article/${article.slug}`}>
              Открыть на сайте
            </Link>
          )}
        </div>
      </div>
      {article?.review_note && article.status === 'rejected' && <p className="alert">Замечание рецензента: {article.review_note}</p>}
      {msg && <p className={`alert${msg.ok ? ' ok' : ''}`} style={{ marginBottom: 20 }}>{msg.text}</p>}

      <div className="split">
        {preview ? (
          <div>
            <h2 style={{ fontSize: '2rem', marginBottom: 12 }}>{form.title}</h2>
            <p className="lead" style={{ marginBottom: 32, fontSize: '1.25rem' }}>{form.summary}</p>
            <RichText source={form.content} />
          </div>
        ) : (
          <form className="form" onSubmit={save} id="article-form">
            <label className="field">
              Заголовок
              <input value={form.title} onChange={set('title')} required minLength={3} maxLength={160} />
            </label>
            <div className="form-row">
              <label className="field">
                Адрес статьи (латиница)
                <input
                  value={form.slug}
                  onChange={(e) => {
                    setSlugTouched(true)
                    set('slug')(e)
                  }}
                  pattern="[a-z0-9\-]{3,120}"
                  required
                />
              </label>
              <label className="field">
                Категория
                <select value={form.category_id} onChange={set('category_id')} required>
                  <option value="">Выберите категорию</option>
                  {topics.map((t) => (
                    <optgroup key={t.id} label={t.name}>
                      {t.categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
            </div>
            <label className="field">
              Краткое описание (до 500 символов)
              <textarea value={form.summary} onChange={set('summary')} required minLength={10} maxLength={500} style={{ minHeight: 80 }} />
            </label>
            <label className="field">
              Текст статьи. «## » — подзаголовок, пустая строка — новый абзац, [[slug|текст]] — ссылка на статью
              <textarea value={form.content} onChange={set('content')} required minLength={20} style={{ minHeight: 360 }} />
            </label>
            <div className="form-row">
              <label className="field">
                Эпоха / дата (подпись)
                <input value={form.era_label} onChange={set('era_label')} placeholder="например, 68–66 млн лет назад" />
              </label>
              <label className="field">
                Значение на шкале (год или −млн лет)
                <input type="number" step="any" value={form.timeline_value} onChange={set('timeline_value')} />
              </label>
            </div>
            <fieldset className="form" style={{ border: 0, padding: 0, margin: 0, gap: 8 }}>
              <legend className="small muted" style={{ marginBottom: 8 }}>Карточка фактов</legend>
              <div className="facts-editor">
                {form.facts.map((f, i) => (
                  <div className="fact-row" key={i}>
                    <input aria-label="Показатель" placeholder="Показатель" value={f.label} onChange={(e) => setFact(i, 'label', e.target.value)} />
                    <input aria-label="Значение" placeholder="Значение" value={f.value} onChange={(e) => setFact(i, 'value', e.target.value)} />
                    <button type="button" className="btn small quiet" onClick={() => setForm((x) => ({ ...x, facts: x.facts.filter((_, j) => j !== i) }))}>
                      Убрать
                    </button>
                  </div>
                ))}
              </div>
              <div>
                <button type="button" className="btn small" onClick={() => setForm((x) => ({ ...x, facts: [...x.facts, { label: '', value: '' }] }))}>
                  Добавить строку
                </button>
              </div>
            </fieldset>
            <label className="field">
              Теги через запятую
              <input value={form.tags} onChange={set('tags')} placeholder="хищник, поздний мел" />
            </label>
            <label className="field">
              Комментарий к правке
              <input value={form.revision_comment} onChange={set('revision_comment')} maxLength={300} placeholder="Что изменено" />
            </label>
            <div>
              <button className="btn primary">{isNew ? 'Создать черновик' : 'Сохранить правку'}</button>
            </div>
          </form>
        )}

        {article ? (
          <div style={{ display: 'grid', gap: 24 }}>
            <LinksPanel article={article} onChange={() => api.article(article.slug).then(setArticle)} />
            <QuizPanel slug={article.slug} />
            <RevisionsPanel slug={article.slug} version={article.updated_at} />
          </div>
        ) : (
          <p className="muted small">Связи, вопросы викторины и история правок станут доступны после создания черновика.</p>
        )}
      </div>
    </div>
  )
}

function LinksPanel({ article, onChange }) {
  const [form, setForm] = useState({ target_slug: '', relation: '' })
  const [error, setError] = useState(null)
  const out = article.links.filter((l) => l.direction === 'out')
  const add = async (e) => {
    e.preventDefault()
    setError(null)
    try {
      await api.addLink(article.slug, form)
      setForm({ target_slug: '', relation: '' })
      onChange()
    } catch (err) {
      setError(err.message)
    }
  }
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Связи с другими статьями</h2>
        <span className="small muted">{out.length}</span>
      </div>
      <div className="panel-body">
        <ul className="relations">
          {out.map((l) => (
            <li key={l.slug}>
              <span>
                {l.title} <span className="muted small">· {l.relation}</span>
              </span>
              <button className="link-btn small" onClick={() => api.removeLink(article.slug, l.slug).then(onChange)}>
                Удалить
              </button>
            </li>
          ))}
        </ul>
        <form className="form" onSubmit={add} style={{ marginTop: 14, gap: 10 }}>
          <input aria-label="Адрес связанной статьи" placeholder="Адрес статьи, например sun" value={form.target_slug}
            onChange={(e) => setForm({ ...form, target_slug: e.target.value })} required />
          <input aria-label="Тип связи" placeholder="Тип связи, например «обращается вокруг»" value={form.relation}
            onChange={(e) => setForm({ ...form, relation: e.target.value })} required minLength={2} />
          {error && <p className="alert">{error}</p>}
          <div>
            <button className="btn small">Добавить связь</button>
          </div>
        </form>
      </div>
    </section>
  )
}

function QuizPanel({ slug }) {
  const [items, setItems] = useState([])
  const [form, setForm] = useState({ question: '', options: 'Вариант 1\nВариант 2\nВариант 3', correct_index: 0, explanation: '' })
  const [error, setError] = useState(null)
  const load = () => api.questions(slug).then(setItems)
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug])
  const options = form.options.split('\n').map((o) => o.trim()).filter(Boolean)
  const add = async (e) => {
    e.preventDefault()
    setError(null)
    try {
      await api.addQuestion(slug, { ...form, options, correct_index: Number(form.correct_index) })
      setForm({ ...form, question: '', explanation: '' })
      load()
    } catch (err) {
      setError(err.message)
    }
  }
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Вопросы викторины</h2>
        <span className="small muted">{items.length}</span>
      </div>
      <div className="panel-body">
        {items.map((q) => (
          <div key={q.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
            <p style={{ fontWeight: 500 }}>{q.question}</p>
            <p className="small muted">
              Верный ответ: {q.options[q.correct_index]} ·{' '}
              <button className="link-btn" onClick={() => api.deleteQuestion(q.id).then(load)}>
                удалить
              </button>
            </p>
          </div>
        ))}
        <form className="form" onSubmit={add} style={{ marginTop: 14, gap: 10 }}>
          <input aria-label="Вопрос" placeholder="Текст вопроса" value={form.question} onChange={(e) => setForm({ ...form, question: e.target.value })} required minLength={5} />
          <textarea aria-label="Варианты ответа" value={form.options} onChange={(e) => setForm({ ...form, options: e.target.value })} style={{ minHeight: 90 }} />
          <select aria-label="Правильный вариант" value={form.correct_index} onChange={(e) => setForm({ ...form, correct_index: e.target.value })}>
            {options.map((o, i) => (
              <option key={i} value={i}>
                Верный: {o}
              </option>
            ))}
          </select>
          <input aria-label="Пояснение" placeholder="Пояснение к ответу" value={form.explanation} onChange={(e) => setForm({ ...form, explanation: e.target.value })} />
          {error && <p className="alert">{error}</p>}
          <div>
            <button className="btn small">Добавить вопрос</button>
          </div>
        </form>
      </div>
    </section>
  )
}

function RevisionsPanel({ slug, version }) {
  const [items, setItems] = useState([])
  useEffect(() => {
    api.revisions(slug).then(setItems)
  }, [slug, version])
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>История правок</h2>
        <span className="small muted">{items.length}</span>
      </div>
      <ul className="relations panel-body">
        {items.map((r) => (
          <li key={r.id}>
            <span>{r.comment || 'Правка'}</span>
            <span className="rel">
              {r.editor?.username} · {formatDate(r.created_at, true)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
