import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { api } from '../api.js'
import Glyph from '../components/Glyph.jsx'
import { Loader, formatEra, plural, useAsync, useDocumentTitle } from '../components/common.jsx'

const SORTS = [
  ['recent', 'Сначала новые'],
  ['popular', 'Популярные'],
  ['title', 'По алфавиту'],
  ['timeline', 'По хронологии'],
]

// Общий экран каталога: вся энциклопедия (/encyclopedia) или один раздел (/topic/:slug)
export default function Catalog() {
  const { slug: topicSlug } = useParams()
  const [params, setParams] = useSearchParams()
  const [topics, setTopics] = useState([])
  const [tags, setTags] = useState([])
  const [draft, setDraft] = useState(params.get('q') || '')
  const [allTags, setAllTags] = useState(false)

  const q = params.get('q') || ''
  const category = params.get('category') || ''
  const tag = params.get('tag') || ''
  const sort = params.get('sort') || (q ? 'relevance' : 'recent')
  const page = Number(params.get('page') || 1)
  const topic = topicSlug || params.get('topic') || ''
  const current = topics.find((t) => t.slug === topic)
  useDocumentTitle(current ? current.name : 'Энциклопедия')

  useEffect(() => {
    api.topics().then(setTopics).catch(() => {})
  }, [])
  useEffect(() => {
    api.tags(topic || undefined).then(setTags).catch(() => {})
  }, [topic])
  useEffect(() => setDraft(q), [q])

  const list = useAsync(
    () => api.articles({ q, topic, category, tag, sort, page, page_size: 12 }),
    [q, topic, category, tag, sort, page],
  )

  const update = (patch) => {
    const next = new URLSearchParams(params)
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)))
    if (!('page' in patch)) next.delete('page')
    setParams(next)
  }

  const unitFor = (slug) => topics.find((t) => t.slug === slug)?.timeline_unit

  return (
    <div data-topic={topic || undefined}>
      <section className="topic-band">
        <div className="topic-band-inner">
          <div>
            <h1>{current ? current.name : 'Энциклопедия'}</h1>
            <p>
              {current
                ? current.description
                : 'Все статьи разделов «Космос» и «Динозавры»: поиск по тексту с учётом словоформ, фильтры по категориям и тегам.'}
            </p>
          </div>
          <nav className="topic-switch" aria-label="Разделы">
            <Link to="/encyclopedia" className={!topic ? 'active' : ''}>
              Все
            </Link>
            {topics.map((t) => (
              <Link key={t.slug} to={`/topic/${t.slug}`} className={topic === t.slug ? 'active' : ''}>
                {t.name}
              </Link>
            ))}
          </nav>
        </div>
      </section>

      <div className="page">
        <div className="catalog">
          <aside className="filters" aria-label="Фильтры">
            {(current ? [current] : topics).map((t) => (
              <div key={t.slug}>
                <h2>{current ? 'Категории' : t.name}</h2>
                <ul className="filter-list">
                  {current && (
                    <li>
                      <button className={!category ? 'active' : ''} onClick={() => update({ category: '' })}>
                        Все категории <span className="muted">{t.article_count}</span>
                      </button>
                    </li>
                  )}
                  {t.categories.map((c) => (
                    <li key={c.id}>
                      <button
                        className={category === c.slug ? 'active' : ''}
                        onClick={() => update({ category: category === c.slug ? '' : c.slug, topic: current ? '' : t.slug })}
                      >
                        {c.name}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {tags.length > 0 && (
              <div>
                <h2>Теги</h2>
                <div className="tag-cloud">
                  {(allTags ? tags : tags.slice(0, 12)).map((t) => (
                    <button
                      key={t.name}
                      className={`tag${tag === t.name ? ' active' : ''}`}
                      onClick={() => update({ tag: tag === t.name ? '' : t.name })}
                    >
                      {t.name}
                    </button>
                  ))}
                  {tags.length > 12 && (
                    <button className="link-btn small" onClick={() => setAllTags((v) => !v)}>
                      {allTags ? 'Свернуть' : `Ещё ${tags.length - 12}`}
                    </button>
                  )}
                </div>
              </div>
            )}
            {current && (
              <div>
                <h2>Инструменты раздела</h2>
                <ul className="filter-list">
                  <li>
                    <Link to={`/timeline/${current.slug}`}>Хронология раздела</Link>
                  </li>
                  <li>
                    <Link to={`/graph?topic=${current.slug}`}>Граф связей</Link>
                  </li>
                  <li>
                    <Link to={`/quiz/${current.slug}`}>Викторина</Link>
                  </li>
                </ul>
              </div>
            )}
          </aside>

          <div>
            <form
              className="searchbar"
              role="search"
              onSubmit={(e) => {
                e.preventDefault()
                update({ q: draft.trim(), sort: '' })
              }}
            >
              <label className="visually-hidden" htmlFor="cat-q">
                Поиск
              </label>
              <input
                id="cat-q"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Поиск по названию и тексту статей"
              />
              <label className="visually-hidden" htmlFor="cat-sort">
                Сортировка
              </label>
              <select id="cat-sort" value={sort} onChange={(e) => update({ sort: e.target.value })}>
                {q && <option value="relevance">По релевантности</option>}
                {SORTS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </form>

            <Loader state={list}>
              {(data) => (
                <>
                  <div className="result-meta">
                    <span>
                      {data.total} {plural(data.total, 'статья', 'статьи', 'статей')}
                      {q && ` по запросу «${q}»`}
                      {tag && ` с тегом «${tag}»`}
                    </span>
                    {(q || tag || category) && (
                      <button className="link-btn" onClick={() => update({ q: '', tag: '', category: '' })}>
                        Сбросить фильтры
                      </button>
                    )}
                  </div>
                  {data.items.length === 0 ? (
                    <p className="state">
                      Ничего не найдено. Попробуйте другое слово — поиск учитывает словоформы: «звезда», «звёзды»,
                      «звёздный».
                    </p>
                  ) : (
                    <ul className="entries">
                      {data.items.map((a) => (
                        <li className="entry" key={a.id}>
                          <Glyph category={a.category_slug} />
                          <div>
                            <h3>
                              <Link to={`/article/${a.slug}`}>{a.title}</Link>
                            </h3>
                            <p>{a.summary}</p>
                          </div>
                          <div className="entry-side">
                            <span>{a.category_name}</span>
                            {formatEra(a, unitFor(a.topic_slug)) && <span>{formatEra(a, unitFor(a.topic_slug))}</span>}
                            <span>{a.views} просмотров</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                  <Pager page={data.page} size={data.page_size} total={data.total} onPage={(p) => update({ page: String(p) })} />
                </>
              )}
            </Loader>
          </div>
        </div>
      </div>
    </div>
  )
}

export function Pager({ page, size, total, onPage }) {
  const pages = Math.max(1, Math.ceil(total / size))
  if (pages <= 1) return null
  return (
    <nav className="pager" aria-label="Страницы">
      <button className="btn small quiet" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        Назад
      </button>
      <span>
        Страница {page} из {pages}
      </span>
      <button className="btn small quiet" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        Дальше
      </button>
    </nav>
  )
}
