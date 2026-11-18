/**
 * The Card recipe's dividing lines, the picture that grows under the pointer
 * and the card whose picture fills it, measured in a real browser: a rule
 * between regions runs edge to edge, a zoom changes the picture's scale only
 * where the pointer is, and an overlay card lays its text over the picture.
 */
import { Schema } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { Card, CardSlots, Recipes } from '../src/index.js'
import { unitKnobs } from './fixture.js'

const theme = Theme.standard(Theme.make({ ...unitKnobs, accent: { hue: 265, chroma: 0.16 } }))
const L = Layers.standard
const Model = Schema.Struct({})

const picture = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 3"><rect width="4" height="3" fill="#888"/></svg>')}`
const looks = {
  none: Style.forSlots(CardSlots)(Recipes.Card({})),
  header: Style.forSlots(CardSlots)(Recipes.Card({ divide: 'header' })),
  sections: Style.forSlots(CardSlots)(Recipes.Card({ divide: 'sections' })),
  zoom: Style.forSlots(CardSlots)(Recipes.Card({ lift: 'zoom' })),
  overlay: Style.forSlots(CardSlots)(Recipes.Card({ orientation: 'overlay' })),
}

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const view = (_: unknown, h: HtmlBuilder<never>): Html =>
  h.div(
    [h.Style({ display: 'grid', gap: '2rem', width: '360px', padding: '32px' })],
    [
      ...(['none', 'header', 'sections'] as const).map(name =>
        Card.view(
          {
            title: `Divide ${name}`,
            description: 'A description',
            content: h.p([], ['Body']),
            footer: h.button([h.Type('button')], [`Footer ${name}`]),
            style: looks[name],
          },
          h,
        ),
      ),
      Card.view(
        {
          image: h.img([h.Src(picture), h.Alt('')]),
          title: 'Zoom',
          press: { href: '#zoom' },
          style: looks.zoom,
        },
        h,
      ),
      Card.view(
        {
          image: h.img([h.Src(picture), h.Alt('')]),
          title: 'Overlay',
          description: 'Text over the picture',
          style: looks.overlay,
        },
        h,
      ),
    ],
  )

const mount = () => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(L.declare, L.in('theme', Theme.root(theme))) +
    Object.values(looks)
      .map(style => style.css)
      .join('')
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'card-looks'
  document.body.appendChild(container)
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: {} }),
      update: (model: typeof Model.Type, _: never) => ({ model }),
      view,
    }),
  )
}

const titled = (title: string) =>
  Array.from(document.querySelectorAll<HTMLElement>('h3')).find(
    heading => heading.textContent === title,
  )!
const header = (title: string) => titled(title).parentElement!
const cardOf = (title: string) => titled(title).closest<HTMLElement>('[data-selected]')!
const footer = (name: string) =>
  Array.from(document.querySelectorAll('button')).find(
    button => button.textContent === `Footer ${name}`,
  )!.parentElement!
const drawn = () => vi.waitFor(() => expect(document.querySelector('h3')).not.toBeNull())
const width = (element: Element, property: 'borderBlockEndWidth' | 'borderBlockStartWidth') =>
  parseFloat(getComputedStyle(element)[property])

test('a rule under the header, or around the body, runs the card’s whole width', async () => {
  const handle = mount()
  try {
    await drawn()
    expect(width(header('Divide none'), 'borderBlockEndWidth')).toBe(0)
    expect(width(footer('none'), 'borderBlockStartWidth')).toBe(0)
    expect(width(header('Divide header'), 'borderBlockEndWidth')).toBeGreaterThan(0)
    expect(width(footer('header'), 'borderBlockStartWidth')).toBe(0)
    for (const name of ['header', 'sections']) {
      const edge = header(`Divide ${name}`).getBoundingClientRect()
      // Inside the card's own border, which `clientWidth` leaves out.
      expect(Math.abs(edge.width - cardOf(`Divide ${name}`).clientWidth)).toBeLessThan(1)
    }
    expect(width(header('Divide sections'), 'borderBlockEndWidth')).toBeGreaterThan(0)
    expect(width(footer('sections'), 'borderBlockStartWidth')).toBeGreaterThan(0)
  } finally {
    await handle.dispose()
  }
})

test('a zoomed picture grows under the pointer and rests at its size', async () => {
  const handle = mount()
  try {
    await drawn()
    const image = cardOf('Zoom').querySelector('img')!
    await userEvent.hover(document.body, { position: { x: 1, y: 1 } })
    expect(getComputedStyle(image).scale).toBe('none')
    await userEvent.hover(cardOf('Zoom'))
    await vi.waitFor(() => expect(parseFloat(getComputedStyle(image).scale)).toBeCloseTo(1.06, 2))
  } finally {
    await handle.dispose()
  }
})

test('an overlay card’s picture fills it and its text lies over the picture', async () => {
  const handle = mount()
  try {
    await drawn()
    const card = cardOf('Overlay')
    const image = card.querySelector('img')!.parentElement!
    const over = image.getBoundingClientRect()
    expect(getComputedStyle(image).position).toBe('absolute')
    expect(Math.abs(over.width - card.clientWidth)).toBeLessThan(1)
    expect(Math.abs(over.height - card.clientHeight)).toBeLessThan(1)
    const text = header('Overlay').getBoundingClientRect()
    expect(text.top).toBeGreaterThanOrEqual(over.top)
    expect(text.bottom).toBeLessThanOrEqual(over.bottom)
    // The fade to the card's surface is what keeps the text readable.
    expect(getComputedStyle(image, '::after').backgroundImage).toContain('linear-gradient')
  } finally {
    await handle.dispose()
  }
})
