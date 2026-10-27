import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api.js'
import Glyph from '../components/Glyph.jsx'
import { TopBar } from '../components/Layout.jsx'
import { plural, useDocumentTitle } from '../components/common.jsx'

// Цвет шапки повторяет главу, которая находится под ней
const CHAPTER_COLORS = {
  hero: ['#ffffff', '#1b241e'],
  space: ['#cfe3c8', '#1b241e'],
  dino: ['#efe6d4', '#1b241e'],
  about: ['#ffffff', '#1b241e'],
  mark: ['#cfe3c8', '#1b241e'],
}

function useChapters(rootRef) {
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const chapters = root.querySelectorAll('[data-chapter]')
    const header = root.querySelector('.topbar')
    const onScroll = () => {
      const probe = (header?.offsetHeight || 64) + 1
      for (const ch of chapters) {
        const r = ch.getBoundingClientRect()
        if (r.top <= probe && r.bottom > probe) {
          const [bg, ink] = CHAPTER_COLORS[ch.dataset.chapter]
          root.style.setProperty('--chapter-bg', bg)
          root.style.setProperty('--chapter-ink', ink)
          break
        }
      }
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })

    const items = root.querySelectorAll('.reveal')
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('in')
            io.unobserve(e.target)
          }
        }),
      { rootMargin: '0px 0px -8% 0px' },
    )
    items.forEach((el) => io.observe(el))
    return () => {
      window.removeEventListener('scroll', onScroll)
      io.disconnect()
    }
  })
}

function LiveSearch() {
  const [q, setQ] = useState('')
  const [items, setItems] = useState([])
  const navigate = useNavigate()

  useEffect(() => {
    if (q.trim().length < 2) {
      setItems([])
      return
    }
    const t = setTimeout(() => {
      api
        .articles({ q: q.trim(), page_size: 5, sort: 'relevance' })
        .then((r) => setItems(r.items))
        .catch(() => setItems([]))
    }, 220)
    return () => clearTimeout(t)
  }, [q])

  return (
    <div className="hero-search">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault()
          navigate(`/encyclopedia?q=${encodeURIComponent(q.trim())}`)
        }}
      >
        <label className="visually-hidden" htmlFor="hero-q">
          Поиск по энциклопедии
        </label>
        <input
          id="hero-q"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Например: кольца, хищник, Гагарин"
          autoComplete="off"
        />
        <button className="btn primary" type="submit">
          Найти статью
        </button>
      </form>
      {items.length > 0 && (
        <ul className="live-results" aria-label="Найденные статьи">
          {items.map((a) => (
            <li key={a.id}>
              <Link to={`/article/${a.slug}`}>
                <Glyph category={a.category_slug} size={22} className="" />
                <span>{a.title}</span>
                <span className="muted small">{a.category_name}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const PERIOD_ORDER = ['triassic', 'jurassic', 'cretaceous', 'kpg-extinction']
const PERIOD_SHORT = { triassic: 'Триас', jurassic: 'Юра', cretaceous: 'Мел', 'kpg-extinction': 'Вымирание' }

export default function Landing() {
  useDocumentTitle(null)
  const ref = useRef(null)
  const [topics, setTopics] = useState([])
  const [space, setSpace] = useState([])
  const [periods, setPeriods] = useState([])
  useChapters(ref)

  useEffect(() => {
    api.topics().then(setTopics).catch(() => {})
    api.articles({ topic: 'space', sort: 'popular', page_size: 6 }).then((r) => setSpace(r.items)).catch(() => {})
    api
      .articles({ topic: 'dinosaurs', category: 'periods', page_size: 10 })
      .then((r) => setPeriods(PERIOD_ORDER.map((s) => r.items.find((a) => a.slug === s)).filter(Boolean)))
      .catch(() => {})
  }, [])

  const spaceTopic = topics.find((t) => t.slug === 'space')
  const dinoTopic = topics.find((t) => t.slug === 'dinosaurs')

  return (
    <div className="landing" ref={ref}>
      <TopBar />
      <main>
        <section className="hero" data-chapter="hero" aria-labelledby="hero-title">
          <div className="hero-main">
            <div>
              <h1 id="hero-title">Энциклопедия космоса и динозавров</h1>
              <p className="hero-sub">
                Курсовой проект <strong>Гуляевой Анастасии Павловны</strong>, группа 25-КБ-ПИ1, по дисциплине
                «Программная инженерия».
              </p>
            </div>
            <LiveSearch />
            <div className="deep-time" aria-label="Два масштаба времени энциклопедии">
              <div>
                <strong>13,8 млрд лет</strong>
                <span>возраст Вселенной — от Большого взрыва до «Джеймса Уэбба»</span>
              </div>
              <div>
                <strong>252 млн лет</strong>
                <span>назад начался триас — первая глава эпохи динозавров</span>
              </div>
            </div>
          </div>
          <nav className="swatches" aria-label="Главы">
            <a href="#space" className="ch-space">
              Космос <span>{spaceTopic ? `${spaceTopic.article_count} ${plural(spaceTopic.article_count, 'статья', 'статьи', 'статей')}` : 'раздел'}</span>
            </a>
            <a href="#dinosaurs" className="ch-dino">
              Динозавры <span>{dinoTopic ? `${dinoTopic.article_count} ${plural(dinoTopic.article_count, 'статья', 'статьи', 'статей')}` : 'раздел'}</span>
            </a>
            <Link to="/timeline/dinosaurs" className="ch-time">
              Хронология <span>шкала времени</span>
            </Link>
            <Link to="/graph" className="ch-graph">
              Граф связей <span>как статьи связаны</span>
            </Link>
            <a href="#about" className="ch-about">
              О проекте <span>автор и система</span>
            </a>
          </nav>
        </section>

        <section id="space" className="chapter-space" data-chapter="space" aria-labelledby="space-title">
          <div className="chapter-inner">
            <div className="chapter-head">
              <h2 id="space-title" className="reveal">
                Космос
              </h2>
              <p className="reveal" style={{ '--i': 1 }}>
                {spaceTopic?.description ||
                  'Солнечная система, звёзды, галактики и история освоения космического пространства.'}
              </p>
            </div>
            <ul className="menu">
              {space.map((a, i) => (
                <li key={a.id} className="reveal" style={{ '--i': i % 2 }}>
                  <Glyph category={a.category_slug} size={64} className="" />
                  <div>
                    <Link className="menu-name" to={`/article/${a.slug}`}>
                      {a.title} <span>{a.category_name}</span>
                    </Link>
                    <p>{a.summary}</p>
                  </div>
                </li>
              ))}
            </ul>
            <div className="chapter-foot">
              <Link className="btn" to="/topic/space">
                Все статьи о космосе
              </Link>
              <Link className="btn quiet" to="/quiz/space">
                Проверить себя в викторине
              </Link>
            </div>
          </div>
        </section>

        <section id="dinosaurs" className="chapter-dino" data-chapter="dino" aria-labelledby="dino-title">
          <div className="chapter-inner">
            <h2 id="dino-title" className="visually-hidden">
              Динозавры
            </h2>
            <p className="stairs" aria-label="Эпоха динозавров по периодам">
              <Link className="reveal" to="/topic/dinosaurs">
                Динозавры
              </Link>
              {periods.map((p, i) => (
                <Link key={p.slug} className="reveal" style={{ '--i': i + 1 }} to={`/article/${p.slug}`}>
                  {PERIOD_SHORT[p.slug]}
                  <small>{p.era_label}</small>
                </Link>
              ))}
            </p>
            <div className="dino-note">
              <p className="reveal">
                {dinoTopic?.article_count ?? 21} {plural(dinoTopic?.article_count ?? 21, 'статья', 'статьи', 'статей')} —
                от целофизиса позднего триаса до астероида, закрывшего мезозойскую эру.
              </p>
              <ul className="dino-groups reveal" style={{ '--i': 1 }}>
                {(dinoTopic?.categories || []).map((c) => (
                  <li key={c.id}>
                    <Link to={`/topic/dinosaurs?category=${c.slug}`}>
                      {c.name} <span aria-hidden="true">→</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section id="about" className="chapter-about" data-chapter="about" aria-labelledby="about-title">
          <div className="about-panel">
            <h2 id="about-title" className="reveal">
              Курсовой проект по программной инженерии
            </h2>
            <div className="about-blocks">
              <div className="reveal">
                <h3>Автор</h3>
                <dl>
                  <dt>Студент</dt>
                  <dd>Гуляева Анастасия Павловна</dd>
                  <dt>Группа</dt>
                  <dd>25-КБ-ПИ1</dd>
                  <dt>Дисциплина</dt>
                  <dd>Программная инженерия</dd>
                  <dt>Год</dt>
                  <dd>2026</dd>
                </dl>
              </div>
              <div className="reveal" style={{ '--i': 1 }}>
                <h3>Что внутри</h3>
                <p>
                  Клиент на React, сервер на Python (FastAPI), данные в PostgreSQL. Роли читателя, редактора и
                  администратора, рецензирование статей, хронология, граф связей и викторины.
                </p>
              </div>
              <div className="reveal" style={{ '--i': 2 }}>
                <Link to="/register" className="btn on-dark">
                  Создать учётную запись читателя
                </Link>
              </div>
            </div>
            <svg className="about-art" viewBox="0 0 560 300" aria-hidden="true">
              <circle cx="150" cy="190" r="120" fill="#cfe3c8" />
              <ellipse cx="150" cy="190" rx="210" ry="38" fill="none" stroke="#efe6d4" strokeWidth="10" />
              <path d="M300 300 L345 190 L390 300 Z M380 300 L430 160 L480 300 Z M470 300 L510 210 L550 300 Z" fill="#efe6d4" />
            </svg>
          </div>
        </section>

        <footer className="mark-footer" data-chapter="mark">
          <div className="blockmark" aria-label="КосмоДино">
            {'КОСМОДИНО'.split('').map((ch, i) => (
              <span key={i} style={{ height: `${[78, 100, 64, 88, 72, 96, 60, 84, 100][i]}%` }} aria-hidden="true">
                {ch}
              </span>
            ))}
          </div>
          <div className="mark-footer-links">
            <ul>
              <li>
                <Link to="/topic/space">Космос</Link>
              </li>
              <li>
                <Link to="/topic/dinosaurs">Динозавры</Link>
              </li>
            </ul>
            <ul>
              <li>
                <Link to="/timeline/space">Хронология космоса</Link>
              </li>
              <li>
                <Link to="/timeline/dinosaurs">Хронология мезозоя</Link>
              </li>
            </ul>
            <ul>
              <li>
                <Link to="/graph">Граф связей</Link>
              </li>
              <li>
                <Link to="/quiz/dinosaurs">Викторина</Link>
              </li>
            </ul>
            <ul>
              <li>
                <Link to="/login">Вход</Link>
              </li>
              <li>
                <Link to="/register">Регистрация</Link>
              </li>
            </ul>
            <p>
              Гуляева Анастасия Павловна, группа 25-КБ-ПИ1. Курсовой проект по дисциплине «Программная инженерия».
              Некоммерческий учебный проект.
            </p>
          </div>
          <div className="mark-footer-bottom">
            <span>© 2026 КосмоДино</span>
            <Link to="/encyclopedia" className="btn small">
              Открыть энциклопедию
            </Link>
          </div>
        </footer>
      </main>
    </div>
  )
}
