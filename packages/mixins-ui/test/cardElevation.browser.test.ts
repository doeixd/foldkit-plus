/**
 * Where a card stands, measured in a real browser over the shipped palette,
 * in both schemes: each elevation is a level of the surface ladder (lighter
 * on a dark page, toward white on a light one) with a shadow of two layers
 * that deepens with it; a chosen card and a group's highlight step away from
 * the page the way its text does, so a dark page shows neither sunken; a
 * lifted card rises under the pointer unless motion is reduced; and the
 * action's badge sits on the title's line, in the corner when nothing else is.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import type { Html, HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { Badge, BadgeSlots, Card, CardGroupSlots, CardSlots, Recipes } from '../src/index.js'
import { unitKnobs } from './fixture.js'

// At unit knobs, and on an off-white light page: the default's is pure
// white, where nothing can stand toward white.
const theme = Theme.standard(
  Theme.make({ ...unitKnobs, accent: { hue: 265, chroma: 0.16 }, surface: { lightness: 97.5 } }),
)
const L = Layers.standard
const Model = Schema.Struct({})
const Message = defineMessageUnion({ Dismissed: {} })
type Message = typeof Message.Type

const levels = (['0', '1', '2', '3'] as const).map(elevation =>
  Style.forSlots(CardSlots)(Recipes.Card({ surface: 'elevated', elevation })),
)
const lifted = Style.forSlots(CardSlots)(Recipes.Card({ lift: 'hover' }))
const outlined = Style.forSlots(CardSlots)(Recipes.Card({}))
const plain = Style.forSlots(CardSlots)(Recipes.Card({ surface: 'plain' }))
const group = Style.forSlots(CardGroupSlots)(Recipes.CardGroup({}))
const badge = Style.forSlots(BadgeSlots)(Recipes.Badge({ attribute: 'data-tone', tones: {} }))
const styles = [...levels, lifted, outlined, plain, group, badge]

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const view = (_: unknown, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Style({ display: 'grid', gap: '2rem', width: '360px', padding: '32px' })],
    [
      ...levels.map((style, index) => Card.view({ title: `Level ${index}`, style }, h)),
      Card.view({ title: 'Lifted', press: { href: '#lifted' }, style: lifted }, h),
      Card.view({ title: 'Still', press: { href: '#still' }, style: lifted }, h),
      Card.view(
        {
          media: h.span([], ['*']),
          title: 'Below a tile',
          action: Badge.view({ text: 'New', style: badge }, h),
          dismiss: { onDismiss: Message.Dismissed() },
          style: outlined,
        },
        h,
      ),
      Card.view(
        {
          title: 'At the top',
          action: Badge.view({ text: 'Soon', style: badge }, h),
          dismiss: { onDismiss: Message.Dismissed(), always: true },
          style: outlined,
        },
        h,
      ),
      Card.group(
        {
          label: 'Plans',
          cards: ['a', 'b'].map(key => ({ key, title: `Plan ${key}`, selected: key === 'b' })),
          style: group,
          cardStyle: plain,
        },
        h,
      ),
    ],
  )

const mount = (scheme: 'light' | 'dark') => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(L.declare, L.in('theme', Theme.root(theme, { colorScheme: scheme }))) +
    styles.map(style => style.css).join('')
  document.head.append(sheet)
  document.body.style.background = 'var(--fk-surface-base)'
  const container = document.createElement('div')
  container.id = `card-elevation-${scheme}`
  document.body.appendChild(container)
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: {} }),
      update: (model: typeof Model.Type, _: Message) => ({ model }),
      view,
    }),
  )
}

const titled = (title: string) =>
  Array.from(document.querySelectorAll<HTMLElement>('h3')).find(
    heading => heading.textContent === title,
  )!
const cardOf = (title: string) => titled(title).closest<HTMLElement>('[data-selected]')!
const drawn = () => vi.waitFor(() => expect(document.querySelector('h3')).not.toBeNull())

/** OKLab's or OKLCH's lightness of a computed color, 0 to 1. */
const lightnessOf = (color: string) => {
  const match = /^okl(?:ab|ch)\(\s*([\d.]+)/.exec(color)
  if (match === null) throw new Error(`not an OKLab or OKLCH color: ${color}`)
  return Number(match[1])
}
const page = () => lightnessOf(getComputedStyle(document.body).backgroundColor)
const fill = (element: Element) => lightnessOf(getComputedStyle(element).backgroundColor)

/** Each layer of a computed `box-shadow`, by its blur. */
const blurs = (element: Element) =>
  Array.from(
    getComputedStyle(element).boxShadow.matchAll(/(-?[\d.]+)px\s+(-?[\d.]+)px\s+([\d.]+)px/g),
    match => Number(match[3]),
  )

test('on a dark page each level is lighter than the last, and level 0 is the page', async () => {
  const handle = mount('dark')
  try {
    await drawn()
    const lightness = [0, 1, 2, 3].map(index => fill(cardOf(`Level ${index}`)))
    expect(Math.abs(lightness[0]! - page())).toBeLessThan(0.002)
    for (let index = 1; index < 4; index += 1) {
      expect(lightness[index]! - lightness[index - 1]!).toBeGreaterThan(0.015)
    }
  } finally {
    handle.dispose()
  }
})

test('on a light page a raised card is toward white, and the shadow carries the rest', async () => {
  const handle = mount('light')
  try {
    await drawn()
    expect(fill(cardOf('Level 1'))).toBeGreaterThan(page() + 0.005)
    expect(fill(cardOf('Level 3'))).toBeGreaterThanOrEqual(fill(cardOf('Level 1')))
  } finally {
    handle.dispose()
  }
})

test.each(['light', 'dark'] as const)(
  'in a %s scheme, a raised card casts a contact and an ambient shadow, deeper with its level',
  async scheme => {
    const handle = mount(scheme)
    try {
      await drawn()
      expect(blurs(cardOf('Level 0'))).toEqual([])
      const one = blurs(cardOf('Level 1'))
      const three = blurs(cardOf('Level 3'))
      expect(one).toHaveLength(2)
      expect(three).toHaveLength(2)
      // One tight, one soft.
      expect(Math.max(...one)).toBeGreaterThan(Math.min(...one))
      expect(Math.max(...three)).toBeGreaterThan(Math.max(...one))
    } finally {
      handle.dispose()
    }
  },
)

test.each(['light', 'dark'] as const)(
  'in a %s scheme, a chosen card and the highlight step away from the page as its text does',
  async scheme => {
    const handle = mount(scheme)
    try {
      await drawn()
      const away = (lightness: number) =>
        scheme === 'dark' ? lightness - page() : page() - lightness
      expect(away(fill(cardOf('Plan b')))).toBeGreaterThan(0.05)
      const highlight = document.querySelector('[aria-label="Plans"]')!.previousElementSibling!
      expect(away(fill(highlight))).toBeGreaterThan(0.05)
    } finally {
      handle.dispose()
    }
  },
)

test('a lifted card rises under the pointer, and not where motion is reduced', async () => {
  const handle = mount('light')
  try {
    await drawn()
    const card = cardOf('Lifted')
    const still = cardOf('Still')
    // What the reset does under `prefers-reduced-motion`, on this card alone.
    still.style.setProperty('--fk-knob-travel', '0')
    const resting = still.getBoundingClientRect().top
    await userEvent.hover(card.querySelector('a')!)
    await vi.waitFor(() => expect(card.getAnimations()).toEqual([]))
    expect(getComputedStyle(card).translate).toBe('0px -2px')
    await userEvent.hover(still.querySelector('a')!)
    await vi.waitFor(() => expect(still.getAnimations()).toEqual([]))
    expect(still.getBoundingClientRect().top).toBe(resting)
    // Its shadow still lifts: only the rise is motion.
    expect(Math.max(...blurs(still))).toBeGreaterThan(Math.max(...blurs(cardOf('Level 0')), 0))
  } finally {
    handle.dispose()
  }
})

test("the action's badge sits on the title's line, in the corner below a tile", async () => {
  const handle = mount('light')
  try {
    await drawn()
    const middle = (element: Element) => {
      const box = element.getBoundingClientRect()
      return box.top + box.height / 2
    }
    const title = titled('Below a tile')
    const action = title.parentElement!.lastElementChild!
    const line = parseFloat(getComputedStyle(title).lineHeight)
    expect(
      Math.abs(middle(action.firstElementChild!) - (title.getBoundingClientRect().top + line / 2)),
    ).toBeLessThan(0.25)
    // Nothing is in the corner beside it, so it runs to the header's end.
    expect(
      Math.abs(
        action.getBoundingClientRect().right - title.parentElement!.getBoundingClientRect().right,
      ),
    ).toBeLessThan(1)
    // At the top, it keeps clear of the dismiss button.
    const top = cardOf('At the top')
    const dismiss = top.querySelector('[data-reveal]')!
    const topAction = titled('At the top').parentElement!.lastElementChild!
    expect(topAction.getBoundingClientRect().right).toBeLessThanOrEqual(
      dismiss.getBoundingClientRect().left,
    )
  } finally {
    handle.dispose()
  }
})
