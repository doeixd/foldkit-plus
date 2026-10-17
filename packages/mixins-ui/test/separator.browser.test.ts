/**
 * Separators in a real browser over the shipped palette: the line stands off
 * the page in both schemes (the subtle outline all but vanished on a dark
 * one); dashed, thick, spacing and inset draw what they say; a label sits
 * centred between two equal rules that take the frame's line; and a
 * vertical rule runs the height of its row.
 */
import { Schema } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { Recipes, Separator, SeparatorSlots } from '../src/index.js'

const theme = Theme.compose(Theme.tokens, Theme.oklch({ accent: { h: 265, c: 0.16, l: '52%' } }))
const L = Layers.standard
const Model = Schema.Struct({})

const plain = Style.forSlots(SeparatorSlots)(Recipes.Separator({}))
const drawn = Style.forSlots(SeparatorSlots)(
  Recipes.Separator({ line: 'dashed', thickness: 'thick', spacing: 'md', inset: 'md' }),
)
const labelled = Style.forSlots(SeparatorSlots)(
  Recipes.Separator({ line: 'dotted', thickness: 'thick', spacing: 'lg' }),
)
const standing = Style.forSlots(SeparatorSlots)(
  Recipes.Separator({ orientation: 'vertical', spacing: 'sm' }),
)

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
        [h.Id('row'), h.Style({ display: 'flex', height: '40px' })],
        [
          h.span([], ['A']),
          Separator.view({ orientation: 'vertical', style: standing }, h),
          h.span([], ['B']),
        ],
      ),
    ],
  )

const mount = async (scheme: 'light' | 'dark') => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(L.declare, L.in('theme', Theme.root(theme, { colorScheme: scheme }))) +
    [plain, drawn, labelled, standing].map(style => style.css).join('')
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
    expect(rule.getBoundingClientRect().height).toBe(40)
    expect(getComputedStyle(rule).borderLeftWidth).toBe('1px')
    expect(getComputedStyle(rule).marginLeft).toBe('8px')
  } finally {
    handle.dispose()
  }
})
