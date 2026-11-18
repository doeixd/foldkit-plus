/**
 * Text on the accent's own fill, selected in a real page: the theme's default
 * selection is the accent's tint, which on that fill is the fill again, so
 * each recipe that draws selectable words on it sets
 * `--fk-selection-background` to `selection.fill-background` beside the fill.
 * The selection must stand off the fill and keep the words at AA.
 */
import { Schema } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import {
  Alert,
  AlertSlots,
  Badge,
  BadgeSlots,
  ChatMessage,
  ChatMessageSlots,
  Recipes,
} from '../src/index.js'
import { contrast, painted, paintedOver } from './colour.js'

const theme = Theme.standard(Theme.make({}))
const Model = Schema.Struct({})

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
  getSelection()?.removeAllRanges()
})

const badge = Style.forSlots(BadgeSlots)(Recipes.Badge({ appearance: 'solid' }))
const alert = Style.forSlots(AlertSlots)(Recipes.Alert({ tone: 'accent', emphasis: 'bold' }))
const chat = Style.forSlots(ChatMessageSlots)(Recipes.ChatMessage({ bubble: 'accent' }))

const WORDS = 'Words on the accent'

const cases: ReadonlyArray<{
  readonly name: string
  readonly css: string
  readonly draw: (h: HtmlBuilder<never>) => Html
}> = [
  {
    name: 'a solid Badge',
    css: badge.css,
    draw: h => Badge.view({ text: WORDS, tone: 'accent', style: badge }, h),
  },
  {
    name: 'a bold Alert',
    css: alert.css,
    draw: h => Alert.view({ layout: 'inline', title: WORDS, style: alert }, h),
  },
  {
    name: 'an accent ChatMessage bubble',
    css: chat.css,
    draw: h => ChatMessage.view({ from: 'user', content: WORDS, style: chat }, h),
  },
]

const mount = (css: string, draw: (h: HtmlBuilder<never>) => Html, scheme: 'light' | 'dark') => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('reset', Defaults.reset),
      Layers.standard.in('theme', Theme.root(theme, { colorScheme: scheme })),
      Layers.standard.in('defaults', Defaults.body),
    ) + css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'selection-on-fill'
  document.body.append(container)
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: {} }),
      update: (model: typeof Model.Type) => ({ model }),
      view: (_: unknown, h: HtmlBuilder<never>) => h.div([], [draw(h)]),
    }),
  )
}

/** The element holding `WORDS` as its own text. */
const holder = (): HTMLElement | undefined =>
  Array.from(document.body.querySelectorAll<HTMLElement>('*')).find(element =>
    Array.from(element.childNodes).some(
      node => node.nodeType === Node.TEXT_NODE && node.textContent === WORDS,
    ),
  )

/** The nearest element at or above `element` with an opaque background: the fill. */
const fillOf = (element: HTMLElement): ReadonlyArray<number> => {
  for (let at: HTMLElement | null = element; at !== null; at = at.parentElement) {
    const color = painted(getComputedStyle(at).backgroundColor)
    if (color[3] === 255) return color
  }
  throw new Error('no filled ancestor')
}

test.each(
  cases.flatMap(entry => (['light', 'dark'] as const).map(scheme => ({ ...entry, scheme }))),
)('$name: selected words stand off the fill and read at AA ($scheme)', async entry => {
  const handle = mount(entry.css, entry.draw, entry.scheme)
  try {
    await vi.waitFor(() => expect(holder()).toBeDefined())
    const element = holder()!
    const range = document.createRange()
    range.selectNodeContents(element)
    getSelection()?.removeAllRanges()
    getSelection()?.addRange(range)
    const fill = fillOf(element)
    const selection = getComputedStyle(element, '::selection')
    const ground = paintedOver(selection.backgroundColor, fill)
    expect(contrast(ground, fill)).toBeGreaterThan(1.3)
    expect(
      contrast(paintedOver(getComputedStyle(element).color, ground), ground),
    ).toBeGreaterThanOrEqual(4.5)
  } finally {
    handle.dispose()
  }
})
