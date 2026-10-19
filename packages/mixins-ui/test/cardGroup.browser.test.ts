/**
 * A card group's layout in a real browser, with the shipped recipes: its
 * columns wrap to fewer where a column would be narrower than `minColumn`,
 * the cards of a row stand equally tall, a divided grid draws its lines
 * between cards only, the highlight shows around a separated card, and a
 * plain card hovers on its own unless a group's highlight is its hover.
 */
import { Schema } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { Card, CardGroupSlots, CardSlots, Recipes } from '../src/index.js'

const Message = defineMessageUnion({ Pressed: { key: Schema.String } })
type Message = typeof Message.Type

const theme = Theme.compose(Theme.tokens, Theme.oklch({ accent: { h: 265, c: 0.16, l: '52%' } }))
const L = Layers.standard
const outlined = Style.forSlots(CardSlots)(Recipes.Card({}))
const plain = Style.forSlots(CardSlots)(Recipes.Card({ surface: 'plain' }))
const divided = Style.forSlots(CardGroupSlots)(Recipes.CardGroup({}))
const separated = Style.forSlots(CardGroupSlots)(Recipes.CardGroup({ layout: 'separated' }))
const fixed = Style.forSlots(CardGroupSlots)(Recipes.CardGroup({ minColumn: 'none' }))

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const cards = (prefix: string, count: number) =>
  Array.from({ length: count }, (_, index) => ({
    key: `${prefix}${index}`,
    title: `${prefix} ${index}`,
    // One long description, so equal heights are not an accident of equal text.
    description: index === 0 ? 'A description long enough to wrap onto lines below' : 'Short',
    press: { onClick: Message.Pressed({ key: `${prefix}${index}` }) },
  }))

const mount = (draw: (h: HtmlBuilder<Message>) => ReadonlyArray<Html>) => {
  const style = document.createElement('style')
  style.dataset['test'] = ''
  style.textContent =
    Style.stylesheet(L.declare, L.in('theme', Theme.root(theme))) +
    [outlined, plain, divided, separated, fixed].map(each => each.css).join('')
  document.head.append(style)
  const container = document.createElement('div')
  container.id = 'card-group-browser'
  document.body.appendChild(container)
  return Runtime.embed(
    Runtime.makeElement({
      Model: Schema.Struct({}),
      container,
      init: () => ({ model: {} }),
      update: (model: {}) => ({ model }),
      view: (_: {}, h: HtmlBuilder<Message>) =>
        h.div([h.Style({ display: 'grid', gap: '2rem', padding: '16px' })], draw(h)),
    }),
  )
}

const box = (width: string, h: HtmlBuilder<Message>, child: Html) =>
  h.div([h.Style({ inlineSize: width })], [child])
const itemsOf = (label: string) =>
  Array.from(document.querySelectorAll<HTMLElement>(`[aria-label="${label}"] > li`))
const rect = (element: Element) => element.getBoundingClientRect()
const columnsOf = (label: string) => new Set(itemsOf(label).map(item => rect(item).left)).size

test('a grid lays its most columns where they fit, fewer where they would be narrow, and keeps a row level', async () => {
  const handle = mount(h => [
    box(
      '900px',
      h,
      Card.group(
        { label: 'Wide', columns: 3, cards: cards('w', 6), style: divided, cardStyle: outlined },
        h,
      ),
    ),
    box(
      '300px',
      h,
      Card.group(
        { label: 'Narrow', columns: 3, cards: cards('n', 3), style: divided, cardStyle: outlined },
        h,
      ),
    ),
    box(
      '300px',
      h,
      Card.group(
        { label: 'Fixed', columns: 3, cards: cards('f', 3), style: fixed, cardStyle: outlined },
        h,
      ),
    ),
    // In a centred row, where nothing gives it a width but its columns.
    h.div(
      [h.Style({ display: 'flex', justifyContent: 'center', inlineSize: '900px' })],
      [
        Card.group(
          {
            label: 'Centred',
            columns: 2,
            cards: cards('c', 2),
            style: divided,
            cardStyle: outlined,
          },
          h,
        ),
      ],
    ),
  ])
  try {
    await vi.waitFor(() => expect(itemsOf('Wide')).toHaveLength(6))
    expect(columnsOf('Wide')).toBe(3)
    expect(columnsOf('Narrow')).toBe(1)
    expect(columnsOf('Fixed')).toBe(3)
    expect(columnsOf('Centred')).toBe(2)
    // Nothing spills past its box at any width.
    const narrow = rect(document.querySelector('[aria-label="Narrow"]')!)
    for (const item of itemsOf('Narrow'))
      expect(rect(item).right).toBeLessThanOrEqual(narrow.right + 0.5)
    // The long description makes its card taller, and the row's others match it.
    const [first, second, third] = itemsOf('Wide').map(item => rect(item.firstElementChild!).height)
    expect(first).toBeGreaterThan(60)
    expect(second).toBe(first)
    expect(third).toBe(first)
  } finally {
    handle.dispose()
  }
})

test('a divided grid draws its lines between cards, never along its own edges, however it wraps', async () => {
  const handle = mount(h => [
    box(
      '600px',
      h,
      Card.group(
        { label: 'Two', columns: 2, cards: cards('t', 3), style: divided, cardStyle: plain },
        h,
      ),
    ),
    box(
      '300px',
      h,
      Card.group(
        { label: 'Wrapped', columns: 2, cards: cards('r', 2), style: divided, cardStyle: plain },
        h,
      ),
    ),
  ])
  try {
    await vi.waitFor(() => expect(itemsOf('Two')).toHaveLength(3))
    const list = rect(document.querySelector('[aria-label="Two"]')!)
    const [a, b, c] = itemsOf('Two').map(rect)
    // The first row's and column's lines lie a line's width out, where the list clips them.
    expect(a!.top).toBe(list.top - 1)
    expect(a!.left).toBe(list.left - 1)
    // Between cards they lie on the boundary: one line, not two.
    expect(b!.left).toBe(a!.right - 1)
    expect(c!.top).toBe(a!.bottom - 1)
    expect(getComputedStyle(document.querySelector('[aria-label="Two"]')!).overflow).toBe('clip')
    // Wrapped to one column, the second card's line is above it, not beside it.
    const [first, second] = itemsOf('Wrapped').map(rect)
    expect(second!.left).toBe(first!.left)
    expect(second!.top).toBe(first!.bottom - 1)
  } finally {
    handle.dispose()
  }
})

test('the highlight shows half the gap around a separated card', async () => {
  const handle = mount(h => [
    box(
      '600px',
      h,
      Card.group(
        { label: 'Apart', columns: 2, cards: cards('s', 2), style: separated, cardStyle: outlined },
        h,
      ),
    ),
  ])
  try {
    await vi.waitFor(() => expect(itemsOf('Apart')).toHaveLength(2))
    const [first, second] = itemsOf('Apart')
    const gap = rect(second!).left - rect(first!).right
    expect(gap).toBeGreaterThan(4)
    const highlight = document.querySelector('[aria-label="Apart"]')!.previousElementSibling!
    await userEvent.hover(second!)
    await vi.waitFor(() => {
      expect(getComputedStyle(highlight).opacity).toBe('1')
      const placed = rect(highlight)
      const card = rect(second!)
      expect(Math.abs(placed.left - (card.left - gap / 2))).toBeLessThan(1)
      expect(Math.abs(placed.width - (card.width + gap))).toBeLessThan(1)
    })
  } finally {
    handle.dispose()
  }
})

test("a plain card tints on hover by itself, and leaves it to a group's highlight", async () => {
  const handle = mount(h => [
    Card.view(
      { title: 'Alone', press: { onClick: Message.Pressed({ key: 'alone' }) }, style: plain },
      h,
    ),
    Card.group(
      { label: 'Still', fluidHover: false, cards: cards('o', 1), style: divided, cardStyle: plain },
      h,
    ),
    Card.group({ label: 'Fluid', cards: cards('g', 1), style: divided, cardStyle: plain }, h),
    // Somewhere to rest the pointer, away from every card.
    h.div([h.Id('rest'), h.Style({ blockSize: '40px' })], []),
  ])
  const fill = (element: Element) => getComputedStyle(element).backgroundColor
  const card = (label: string) => itemsOf(label)[0]!.firstElementChild!
  try {
    await vi.waitFor(() => expect(document.querySelector('[aria-label="Alone"]')).toBeTruthy())
    const alone = document.querySelector('[aria-label="Alone"]')!.parentElement!
    await userEvent.hover(document.getElementById('rest')!)
    // Waited for: a pointer an earlier test left over a spot fades out.
    await vi.waitFor(() => {
      for (const each of [alone, card('Still'), card('Fluid')])
        expect(fill(each)).toBe('rgba(0, 0, 0, 0)')
    })
    for (const each of [alone, card('Still')]) {
      await userEvent.hover(each)
      await vi.waitFor(() => expect(fill(each)).not.toBe('rgba(0, 0, 0, 0)'))
    }
    await userEvent.hover(card('Fluid'))
    const highlight = document.querySelector('[aria-label="Fluid"]')!.previousElementSibling!
    await vi.waitFor(() => expect(getComputedStyle(highlight).opacity).toBe('1'))
    expect(fill(card('Fluid'))).toBe('rgba(0, 0, 0, 0)')
  } finally {
    handle.dispose()
  }
})
