import { Fragment } from 'react'
import { Link } from 'react-router-dom'

// Разметка статей: «## » — подзаголовок, пустая строка — новый абзац,
// [[slug|текст]] — внутренняя ссылка на другую статью энциклопедии.
const WIKI = /\[\[([a-z0-9-]+)\|([^\]]+)\]\]/g

export function renderInline(text) {
  const parts = []
  let last = 0
  for (const m of text.matchAll(WIKI)) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    parts.push(
      <Link key={m.index} className="wiki" to={`/article/${m[1]}`}>
        {m[2]}
      </Link>,
    )
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}

export function parseBlocks(source) {
  const blocks = []
  let para = []
  const flush = () => {
    if (para.length) blocks.push({ type: 'p', text: para.join(' ') })
    para = []
  }
  for (const raw of source.split('\n')) {
    const line = raw.trim()
    if (line.startsWith('## ')) {
      flush()
      blocks.push({ type: 'h2', text: line.slice(3) })
    } else if (!line) {
      flush()
    } else {
      para.push(line)
    }
  }
  flush()
  return blocks
}

export default function RichText({ source }) {
  return (
    <div className="prose">
      {parseBlocks(source).map((b, i) => (
        <Fragment key={i}>{b.type === 'h2' ? <h2>{b.text}</h2> : <p>{renderInline(b.text)}</p>}</Fragment>
      ))}
    </div>
  )
}

// Текст без разметки — для превью и поиска
export function plain(source) {
  return source.replace(WIKI, '$2').replace(/^## /gm, '')
}
