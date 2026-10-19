/**
 * Separators in a real browser over the shipped palette: the line stands off
 * the page in both schemes (the subtle outline all but vanished on a dark
 * one); dashed, thick, spacing and inset draw what they say; a label sits
 * centred between two equal rules that take the frame's line; and a
 * vertical rule, drawn by the same style as a horizontal one, runs the height
 * of its row, short of it by the inset, and a line tall in running text.
 */
import { Schema } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { Recipes, Separator, SeparatorSlots } from '../src/index.js'

const theme = Theme.standard(Theme.make({ accent: { hue: 265, chroma: 0.16 } }))
const L = Layers.standard
const Model = Schema.Struct({})

const plain = Style.forSlots(SeparatorSlots)(Recipes.Separator({}))
const drawn = Style.forSlots(SeparatorSlots)(
  Recipes.Separator({ line: 'dashed', thickness: 'thick', spacing: 'md', inset: 'md' }),
)
const labelled = Style.forSlots(SeparatorSlots)(
  Recipes.Separator({ line: 'dotted', thickness: 'thick', spacing: 'lg' }),
)
const standing = Style.forSlots(SeparatorSlots)(Recipes.Separator({ spacing: 'sm' }))
const inset = Style.forSlots(SeparatorSlots)(Recipes.Separator({ spacing: 'sm', inset: 'sm' }))

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const box = (h: HtmlBuilder<never>, id: string, children: ReadonlyArray<Html>) =>
  h.div([h.Id(id), h.Style({ width: '400px' })], children)

const view = (_: unknown, h: HtmlBuilder<never>): Html =>
  h.div(
    [],
    [
      box(h, 'plain', [Separator.view({ style: plain }, h)]),
      box(h, 'drawn', [Separator.view({ style: drawn }, h)]),
      box(h, 'labelled', [Separator.view({ label: 'or', style: labelled }, h)]),
      h.div(
        [h.Id('row'), h.Style({ display: 'flex', height: '80px' })],
        [
          h.span([], ['A']),
          Separator.view({ orientation: 'vertical', style: standing }, h),
          h.span([], ['B']),
          Separator.view({ orientation: 'vertical', label: 'or', style: standing }, h),
          h.span([], ['C']),
        ],
      ),
      h.div(
        [h.Id('toolbar'), h.Style({ display: 'flex', alignItems: 'center' })],
        [
          h.span([h.Style({ display: 'block', height: '32px' })], ['A']),
          Separator.view({ orientation: 'vertical', style: inset }, h),
          h.span([], ['B']),
        ],
      ),
      h.div(
        [h.Id('short'), h.Style({ display: 'flex', height: '40px' })],
        [Separator.view({ orientation: 'vertical', label: 'or', style: standing }, h)],
      ),
      h.p(
        [h.Id('text'), h.Style({ lineHeight: '24px' })],
        ['Docs', Separator.view({ orientation: 'vertical', style: standing }, h), 'Blog'],
      ),
    ],
  )

const mount = async (scheme: 'light' | 'dark') => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(L.declare, L.in('theme', Theme.root(theme, { colorScheme: scheme }))) +
    [plain, drawn, labelled, standing, inset].map(style => style.css).join('')
  document.head.append(sheet)
  document.body.style.background = 'var(--fk-surface-base)'
  const container = document.createElement('div')
  container.id = `separator-${scheme}`
  document.body.appendChild(container)
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: {} }),
      update: (model: typeof Model.Type) => ({ model }),
      view,
    }),
  )
  await vi.waitFor(() => expect(document.getElementById('row')).not.toBeNull())
  return handle
}

const inside = (id: string) => document.getElementById(id)!.firstElementChild!
const lightnessOf = (color: string) => Number(/^okl(?:ab|ch)\(\s*([\d.]+)/.exec(color)![1])

test.each(['light', 'dark'] as const)(
  'in a %s scheme, the line stands off the page',
  async scheme => {
    const handle = await mount(scheme)
    try {
      const rule = getComputedStyle(inside('plain'))
      const page = lightnessOf(getComputedStyle(document.body).backgroundColor)
      expect(Math.abs(lightnessOf(rule.borderTopColor) - page)).toBeGreaterThan(0.1)
      expect(rule.borderTopWidth).toBe('1px')
      expect(rule.borderTopStyle).toBe('solid')
    } finally {
      handle.dispose()
    }
  },
)

test('dashed, thick, spacing and inset draw what they say', async () => {
  const handle = await mount('light')
  try {
    const rule = inside('drawn')
    const style = getComputedStyle(rule)
    expect(style.borderTopStyle).toBe('dashed')
    expect(style.borderTopWidth).toBe('2px')
    expect(style.marginTop).toBe('16px')
    expect(style.marginBottom).toBe('16px')
    expect(rule.getBoundingClientRect().width).toBe(400 - 2 * 24)
  } finally {
    handle.dispose()
  }
})

test('a label sits centred between two equal rules that take the frame’s line', async () => {
  const handle = await mount('light')
  try {
    const frame = inside('labelled')
    const [before, label, after] = Array.from(frame.children)
    const [left, middle, right] = [before!, label!, after!].map(part =>
      part.getBoundingClientRect(),
    )
    expect(Math.abs(left!.width - right!.width)).toBeLessThan(0.5)
    expect(left!.width).toBeGreaterThan(100)
    const centre = document.getElementById('labelled')!.getBoundingClientRect()
    expect(Math.abs(middle!.left + middle!.width / 2 - (centre.left + 200))).toBeLessThan(0.5)
    const rule = getComputedStyle(before!)
    expect(rule.borderTopWidth).toBe('2px')
    expect(rule.borderTopStyle).toBe('dotted')
    // The frame keeps the room; the rules inside it add none.
    expect(rule.marginTop).toBe('0px')
    expect(getComputedStyle(frame).marginTop).toBe('32px')
  } finally {
    handle.dispose()
  }
})

test('a vertical rule runs the height of its row', async () => {
  const handle = await mount('light')
  try {
    const rule = document.getElementById('row')!.children[1]!
    expect(rule.getBoundingClientRect().height).toBe(80)
    expect(getComputedStyle(rule).borderLeftWidth).toBe('1px')
    expect(getComputedStyle(rule).marginLeft).toBe('8px')
  } finally {
    handle.dispose()
  }
})

test('in a row of no set height, a vertical rule stretches short of it by the inset', async () => {
  const handle = await mount('light')
  try {
    const rule = document.getElementById('toolbar')!.children[1]!
    expect(rule.getBoundingClientRect().height).toBe(32 - 2 * 8)
  } finally {
    handle.dispose()
  }
})

test('in running text, a vertical rule stands as tall as the letters, inside the line', async () => {
  const handle = await mount('light')
  try {
    const text = document.getElementById('text')!
    const rule = text.querySelector('[role="separator"]')!
    expect(rule.getBoundingClientRect().height).toBe(16)
    expect(text.getBoundingClientRect().height).toBe(24)
    // Centred on the letters, not standing on their baseline.
    const words = document.createRange()
    words.selectNodeContents(text.firstChild!)
    const middle = (box: DOMRect) => box.top + box.height / 2
    expect(
      Math.abs(middle(rule.getBoundingClientRect()) - middle(words.getBoundingClientRect())),
    ).toBeLessThan(1.5)
    expect(getComputedStyle(rule).borderTopWidth).toBe('0px')
  } finally {
    handle.dispose()
  }
})

test('a vertical label stands between two equal upright rules', async () => {
  const handle = await mount('light')
  try {
    const frame = document.getElementById('row')!.children[3]!
    const [before, label, after] = Array.from(frame.children)
    expect(frame.getBoundingClientRect().height).toBe(80)
    expect(label!.getBoundingClientRect().top).toBeGreaterThan(
      before!.getBoundingClientRect().bottom,
    )
    expect(before!.getBoundingClientRect().height).toBeGreaterThan(16)
    expect(before!.getBoundingClientRect().height).toBe(after!.getBoundingClientRect().height)
    expect(before!.getBoundingClientRect().width).toBe(1)
    expect(getComputedStyle(before!).borderTopWidth).toBe('0px')
  } finally {
    handle.dispose()
  }
})

test('in a short row, a vertical label’s rules give way to the words', async () => {
  const handle = await mount('light')
  try {
    const frame = document.getElementById('short')!.firstElementChild!
    expect(frame.scrollHeight).toBe(frame.clientHeight)
  } finally {
    handle.dispose()
  }
})
