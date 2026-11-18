/**
 * A card's elevation shows in the default theme: its shadow has colour (the
 * `shadow.strength` knob is not 0), and each level casts a wider one than the
 * last, in both schemes. Measured over the default knobs, which a test of a
 * mechanism does not use (`unitKnobs` pins full shadows).
 */
import * as Runtime from 'foldkit/runtime'
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { Layers, Style } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { Card, CardSlots, Recipes } from '../src/index.js'

const L = Layers.standard
const Model = Schema.Struct({})
const levels = (['1', '2', '3'] as const).map(elevation =>
  Style.forSlots(CardSlots)(Recipes.Card({ surface: 'elevated', elevation })),
)

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const mount = (scheme: 'light' | 'dark') => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      L.declare,
      L.in('theme', Theme.root(Theme.standard(), { colorScheme: scheme })),
    ) + levels.map(style => style.css).join('')
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = `card-shadow-${scheme}`
  document.body.append(container)
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: {} }),
      update: (model: typeof Model.Type, _: never) => ({ model }),
      view: (_: unknown, h: HtmlBuilder<never>) =>
        h.div(
          [h.Style({ display: 'grid', gap: '2rem', width: '360px', padding: '32px' })],
          levels.map((style, index) => Card.view({ title: `Level ${index + 1}`, style }, h)),
        ),
    }),
  )
}

const cardOf = (title: string) =>
  Array.from(document.querySelectorAll<HTMLElement>('h3'))
    .find(heading => heading.textContent === title)!
    .closest<HTMLElement>('[data-selected]')!

/** Each layer of a computed `box-shadow`: its blur and its colour's alpha. */
const layers = (element: Element) =>
  Array.from(
    getComputedStyle(element).boxShadow.matchAll(
      /(oklab|oklch|rgba?|color)\([^)]*?(?:\/\s*([\d.]+))?\)\s+-?[\d.]+px\s+-?[\d.]+px\s+([\d.]+)px/g,
    ),
    match => ({ alpha: match[2] === undefined ? 1 : Number(match[2]), blur: Number(match[3]) }),
  )

test.each(['light', 'dark'] as const)(
  'in the default theme and a %s scheme, a raised card casts a coloured shadow that widens with its level',
  async scheme => {
    const handle = mount(scheme)
    try {
      await vi.waitFor(() => expect(document.querySelectorAll('h3')).toHaveLength(3))
      const widest = ['Level 1', 'Level 2', 'Level 3'].map(title => {
        const shadow = layers(cardOf(title))
        expect(shadow.length, getComputedStyle(cardOf(title)).boxShadow).toBeGreaterThan(0)
        // Mixed toward transparent by the strength knob, but not away: 0 would draw no colour.
        for (const layer of shadow) expect(layer.alpha).toBeGreaterThan(0.01)
        return Math.max(...shadow.map(layer => layer.blur))
      })
      expect(widest[1]).toBeGreaterThan(widest[0]!)
      expect(widest[2]).toBeGreaterThan(widest[1]!)
    } finally {
      handle.dispose()
    }
  },
)
