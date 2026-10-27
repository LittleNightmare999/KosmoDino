import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api.js'
import { Loader, formatEra, useAsync, useDocumentTitle } from '../components/common.jsx'

// Геохронологические периоды мезозоя (млн лет назад, по шкале ICS)
const PERIODS = [
  { name: 'Триас', from: -252, to: -201, color: '#e4d6b8' },
  { name: 'Юра', from: -201, to: -145, color: '#d9c7a1' },
  { name: 'Мел', from: -145, to: -66, color: '#efe6d4' },
]

const CONFIG = {
  dinosaurs: { title: 'Хронология мезозоя', min: -255, max: -60, unit: 'млн лет назад', ticks: [-250, -200, -150, -100, -66] },
  space: { title: 'Хронология открытий и полётов', min: 1740, max: 2030, unit: 'год', ticks: [1750, 1800, 1850, 1900, 1950, 2000] },
}

export default function Timeline() {
  const { topic } = useParams()
  const cfg = CONFIG[topic] || CONFIG.dinosaurs
  useDocumentTitle(cfg.title)
  const state = useAsync(() => api.timeline(topic), [topic])
  const [active, setActive] = useState(null)
  const pos = (v) => ((v - cfg.min) / (cfg.max - cfg.min)) * 100
  const label = (v) => (topic === 'space' ? v : `${Math.abs(v)}`)

  return (
    <div data-topic={topic}>
      <section className="topic-band">
        <div className="topic-band-inner">
          <div>
            <h1>{cfg.title}</h1>
            <p>
              {topic === 'space'
                ? 'От предсказания кометы Галлея до запуска «Джеймса Уэбба»: события раздела «Космос» на одной шкале.'
                : 'Динозавры и события мезозойской эры на шкале геологического времени. Наведите на отметку или выберите строку списка.'}
            </p>
          </div>
          <nav className="topic-switch" aria-label="Раздел">
            <Link to="/timeline/space" className={topic === 'space' ? 'active' : ''}>
              Космос
            </Link>
            <Link to="/timeline/dinosaurs" className={topic === 'dinosaurs' ? 'active' : ''}>
              Динозавры
            </Link>
          </nav>
        </div>
      </section>
      <div className="page">
        <Loader state={state}>
          {(items) => (
            <div className="timeline">
              <div className="tl-scale" aria-hidden="true">
                {items.map((a) => (
                  <Link
                    key={a.id}
                    to={`/article/${a.slug}`}
                    className="tl-marker"
                    title={`${a.title} — ${formatEra(a, cfg.unit)}`}
                    onMouseEnter={() => setActive(a.id)}
                    onMouseLeave={() => setActive(null)}
                    style={{
                      left: `${pos(a.timeline_value)}%`,
                      height: active === a.id ? 64 : 40,
                      bottom: 0,
                      top: 'auto',
                      width: active === a.id ? 4 : 2,
                      background: active === a.id ? 'var(--ink)' : 'var(--accent)',
                    }}
                  />
                ))}
              </div>
              {topic === 'dinosaurs' && (
                <div className="tl-periods" aria-label="Периоды">
                  {PERIODS.map((p) => (
                    <div
                      key={p.name}
                      className="tl-period"
                      style={{ width: `${pos(p.to) - pos(p.from)}%`, marginLeft: p === PERIODS[0] ? `${pos(p.from)}%` : 0, background: p.color }}
                    >
                      {p.name}
                    </div>
                  ))}
                </div>
              )}
              <div className="tl-bar-wrap" aria-hidden="true">
                {cfg.ticks.map((t) => (
                  <span key={t} className="tl-tick" style={{ left: `${pos(t)}%`, top: 0, bottom: 'auto' }}>
                    {label(t)}
                  </span>
                ))}
              </div>
              <p className="small muted" style={{ marginTop: 12 }}>
                Шкала: {cfg.unit}
              </p>

              <ol className="tl-list">
                {items.map((a) => (
                  <li
                    key={a.id}
                    className="tl-item"
                    onMouseEnter={() => setActive(a.id)}
                    onMouseLeave={() => setActive(null)}
                    style={active === a.id ? { background: 'var(--field-soft)' } : undefined}
                  >
                    <span className="tl-when">{formatEra(a, cfg.unit)}</span>
                    <span className="tl-dot" aria-hidden="true" />
                    <span>
                      <Link to={`/article/${a.slug}`}>{a.title}</Link>
                      <span className="muted small"> · {a.category_name}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </Loader>
      </div>
    </div>
  )
}
