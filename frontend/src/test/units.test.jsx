import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import RichText, { parseBlocks, plain } from '../components/RichText.jsx'
import { formatEra, plural } from '../components/common.jsx'
import { slugify } from '../pages/editor/ArticleEditor.jsx'
import { layout } from '../pages/Graph.jsx'

describe('разметка статей', () => {
  it('делит текст на заголовки и абзацы', () => {
    const blocks = parseBlocks('## Строение\nПервая строка\nпродолжение\n\nВторой абзац')
    expect(blocks).toEqual([
      { type: 'h2', text: 'Строение' },
      { type: 'p', text: 'Первая строка продолжение' },
      { type: 'p', text: 'Второй абзац' },
    ])
  })

  it('превращает [[slug|текст]] во внутреннюю ссылку', () => {
    render(
      <MemoryRouter>
        <RichText source={'Спутник [[earth|Земли]] — Луна.'} />
      </MemoryRouter>,
    )
    const link = screen.getByRole('link', { name: 'Земли' })
    expect(link).toHaveAttribute('href', '/article/earth')
  })

  it('убирает разметку для превью', () => {
    expect(plain('## Заголовок\nТекст про [[sun|Солнце]]')).toBe('Заголовок\nТекст про Солнце')
  })
})

describe('вспомогательные функции', () => {
  it('склоняет существительные после числительных', () => {
    const f = (n) => plural(n, 'статья', 'статьи', 'статей')
    expect([1, 2, 5, 11, 21, 22, 25, 112].map(f)).toEqual([
      'статья', 'статьи', 'статей', 'статей', 'статья', 'статьи', 'статей', 'статей',
    ])
  })

  it('форматирует эпоху для обоих разделов', () => {
    expect(formatEra({ era_label: '', timeline_value: 1961 }, 'год')).toBe('1961 г.')
    expect(formatEra({ era_label: '', timeline_value: -67 }, 'млн лет назад')).toBe('67 млн лет назад')
    expect(formatEra({ era_label: 'поздний мел', timeline_value: -67 }, 'млн лет назад')).toBe('поздний мел')
    expect(formatEra({ era_label: '', timeline_value: null }, 'год')).toBe('')
  })

  it('строит адрес статьи транслитерацией', () => {
    expect(slugify('Тираннозавр рекс')).toBe('tirannozavr-reks')
    expect(slugify('  Комета Галлея!  ')).toBe('kometa-galleya')
    expect(slugify('Щука и ёж')).toBe('schuka-i-ezh')
  })
})

describe('укладка графа', () => {
  const nodes = [
    { id: 1, topic_slug: 'space' },
    { id: 2, topic_slug: 'space' },
    { id: 3, topic_slug: 'dinosaurs' },
    { id: 4, topic_slug: 'dinosaurs' },
  ]
  const edges = [
    { source: 1, target: 2 },
    { source: 3, target: 4 },
  ]

  it('размещает все узлы внутри полотна', () => {
    const pos = layout(nodes, edges, 100)
    for (const n of nodes) {
      const p = pos.get(n.id)
      expect(p.x).toBeGreaterThanOrEqual(30)
      expect(p.x).toBeLessThanOrEqual(1200 - 210)
      expect(p.y).toBeGreaterThanOrEqual(30)
      expect(p.y).toBeLessThanOrEqual(720 - 30)
    }
  })

  it('детерминирована: одинаковые данные — одинаковая картинка', () => {
    const a = layout(nodes, edges, 50)
    const b = layout(nodes, edges, 50)
    expect([...a.values()].map((p) => [p.x, p.y])).toEqual([...b.values()].map((p) => [p.x, p.y]))
  })

  it('связанные узлы оказываются ближе несвязанных', () => {
    const pos = layout(nodes, edges)
    const d = (i, j) => Math.hypot(pos.get(i).x - pos.get(j).x, pos.get(i).y - pos.get(j).y)
    expect(d(1, 2)).toBeLessThan(d(1, 3))
  })
})
