import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../api.js'
import { Loader, useAsync, useDocumentTitle } from '../components/common.jsx'

const W = 1200
const H = 720

// Простая силовая укладка графа (пружины + отталкивание), детерминированная для одинаковых данных
export function layout(nodes, edges, iterations = 320) {
  const pts = nodes.map((n, i) => {
    const a = (i / nodes.length) * Math.PI * 2
    const side = n.topic_slug === 'space' ? -1 : 1
    return { id: n.id, x: W / 2 - 90 + side * 240 + Math.cos(a) * 160, y: H / 2 + Math.sin(a) * 240, vx: 0, vy: 0 }
  })
  const index = new Map(pts.map((p, i) => [p.id, i]))
  for (let it = 0; it < iterations; it++) {
    const t = 1 - it / iterations
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const dx = pts[i].x - pts[j].x
        const dy = pts[i].y - pts[j].y
        const d2 = Math.max(dx * dx + dy * dy, 100)
        const f = 9000 / d2
        pts[i].vx += dx * f * 0.05
        pts[i].vy += dy * f * 0.05
        pts[j].vx -= dx * f * 0.05
        pts[j].vy -= dy * f * 0.05
      }
    }
    for (const e of edges) {
      const a = pts[index.get(e.source)]
      const b = pts[index.get(e.target)]
      if (!a || !b) continue
      const dx = b.x - a.x
      const dy = b.y - a.y
      const d = Math.sqrt(dx * dx + dy * dy) || 1
      const f = (d - 120) * 0.012
      a.vx += (dx / d) * f * d * 0.05
      a.vy += (dy / d) * f * d * 0.05
      b.vx -= (dx / d) * f * d * 0.05
      b.vy -= (dy / d) * f * d * 0.05
    }
    for (const p of pts) {
      p.vx += (W / 2 - 90 - p.x) * 0.002
      p.vy += (H / 2 - p.y) * 0.004
      p.x = Math.min(W - 210, Math.max(30, p.x + p.vx * t))
      p.y = Math.min(H - 30, Math.max(30, p.y + p.vy * t))
      p.vx *= 0.5
      p.vy *= 0.5
    }
  }
  return new Map(pts.map((p) => [p.id, p]))
}

export default function Graph() {
  useDocumentTitle('Граф связей')
  const [params, setParams] = useSearchParams()
  const topic = params.get('topic') || ''
  const state = useAsync(() => api.graph(topic || undefined), [topic])

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Граф связей</h1>
          <p>
            Каждая статья — узел, каждая связь из статьи — ребро. Зелёные узлы — космос, бежевые — динозавры. Выберите
            узел, чтобы увидеть его соседей.
          </p>
        </div>
        <div className="segmented" role="group" aria-label="Раздел">
          {[
            ['', 'Все'],
            ['space', 'Космос'],
            ['dinosaurs', 'Динозавры'],
          ].map(([v, l]) => (
            <button key={v} className={topic === v ? 'active' : ''} onClick={() => setParams(v ? { topic: v } : {})}>
              {l}
            </button>
          ))}
        </div>
      </div>
      <Loader state={state}>{(g) => <GraphCanvas graph={g} focusSlug={params.get('focus')} />}</Loader>
    </div>
  )
}

function GraphCanvas({ graph, focusSlug }) {
  const positions = useMemo(() => layout(graph.nodes, graph.edges), [graph])
  const bySlug = useMemo(() => new Map(graph.nodes.map((n) => [n.slug, n])), [graph])
  const [selected, setSelected] = useState(() => bySlug.get(focusSlug)?.id ?? null)
  const [hover, setHover] = useState(null)
  const focus = hover ?? selected

  const neighbours = useMemo(() => {
    const s = new Set()
    if (focus == null) return s
    for (const e of graph.edges) {
      if (e.source === focus) s.add(e.target)
      if (e.target === focus) s.add(e.source)
    }
    return s
  }, [focus, graph])

  const node = graph.nodes.find((n) => n.id === selected)
  const rels = node
    ? graph.edges
        .filter((e) => e.source === node.id || e.target === node.id)
        .map((e) => {
          const other = graph.nodes.find((n) => n.id === (e.source === node.id ? e.target : e.source))
          return { other, relation: e.relation, out: e.source === node.id }
        })
    : []

  return (
    <>
      <div className="graph-wrap">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Граф: ${graph.nodes.length} статей, ${graph.edges.length} связей`}>
          {graph.edges.map((e, i) => {
            const a = positions.get(e.source)
            const b = positions.get(e.target)
            const lit = focus != null && (e.source === focus || e.target === focus)
            return (
              <line
                key={i}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke={lit ? '#1b241e' : '#b9b09e'}
                strokeWidth={lit ? 2 : 1}
                opacity={focus == null || lit ? 1 : 0.35}
              />
            )
          })}
          {graph.nodes.map((n) => {
            const p = positions.get(n.id)
            const dim = focus != null && n.id !== focus && !neighbours.has(n.id)
            const isSel = n.id === selected
            return (
              <g
                key={n.id}
                transform={`translate(${p.x},${p.y})`}
                opacity={dim ? 0.3 : 1}
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => setHover(n.id)}
                onMouseLeave={() => setHover(null)}
                onClick={() => setSelected(isSel ? null : n.id)}
                tabIndex={0}
                role="button"
                aria-label={n.title}
                onKeyDown={(e) => e.key === 'Enter' && setSelected(n.id)}
              >
                <rect
                  x={-9}
                  y={-9}
                  width={18}
                  height={18}
                  fill={n.topic_slug === 'space' ? '#cfe3c8' : '#efe6d4'}
                  stroke="#1b241e"
                  strokeWidth={isSel ? 3 : 1.5}
                />
                <text x={14} y={5} fontSize="14" fill="#1b241e" fontFamily="Onest, sans-serif">
                  {n.title}
                </text>
              </g>
            )
          })}
        </svg>
        {node && (
          <div className="graph-panel">
            <p className="small muted">{node.category_name}</p>
            <h3>{node.title}</h3>
            <ul className="relations" style={{ margin: '10px 0 14px' }}>
              {rels.map((r) => (
                <li key={`${r.other.id}-${r.out}`}>
                  <button className="link-btn" onClick={() => setSelected(r.other.id)}>
                    {r.other.title}
                  </button>
                  <span className="rel">{r.out ? r.relation : `← ${r.relation}`}</span>
                </li>
              ))}
            </ul>
            <Link className="btn small primary" to={`/article/${node.slug}`}>
              Открыть статью
            </Link>
          </div>
        )}
      </div>
      <div className="graph-legend">
        <span style={{ '--swatch': '#cfe3c8' }}>Космос</span>
        <span style={{ '--swatch': '#efe6d4' }}>Динозавры</span>
        <span>
          {graph.nodes.length} статей · {graph.edges.length} связей
        </span>
      </div>
    </>
  )
}
