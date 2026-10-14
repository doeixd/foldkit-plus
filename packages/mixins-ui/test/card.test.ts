/**
 * Card and CardGroup as markup: the regions a card earns, one control
 * stretched over a pressable card and named by its title, the state it
 * carries for a style, and a group's grid of keyed items with one highlight.
 * What pressing and hovering do in a real page is `card.browser.test.ts`.
 */
import { describe, expect, it } from 'vitest'
import { Capability, Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import {
  CARD_HOVER,
  CardGroupSlots,
  CardSlots,
  group as drawGroup,
  view as drawCard,
  type CardGroupView,
  type CardView,
} from '../src/card.js'
import { Recipes } from '../src/index.js'
import { h, message, type TestMessage } from './fixture.js'

// Slots are found by the mark a style writes, so every card is drawn styled, as an app draws it.
const cardStyle = Style.forSlots(CardSlots)(Recipes.Card({}))
const groupStyle = Style.forSlots(CardGroupSlots)(Recipes.CardGroup({}))
const view = (options: CardView<TestMessage>) => drawCard({ style: cardStyle, ...options }, h)
const group = (options: CardGroupView<TestMessage>) =>
  drawGroup({ style: groupStyle, cardStyle, ...options }, h)

type Drawn = ReturnType<typeof drawCard>
/** The elements under `root` that carry `attribute`. */
const having = (root: Drawn, attribute: string) =>
  Inert.all(root).filter(node => Inert.value(node, attribute) !== undefined)
const overlayOf = (card: Drawn) => having(card, 'data-fluid-press')[0]
const dismissOf = (card: Drawn) => having(card, 'data-reveal')[0]
const itemsOf = (drawn: Drawn) => having(drawn, 'data-card-item')
const highlightOf = (drawn: Drawn) =>
  Inert.children(drawn).filter(node => Inert.value(node, 'aria-hidden') === 'true')

describe('CardSlots', () => {
  it('publishes its regions as containers, and the overlay and dismiss as controls', () => {
    const interactive = Object.entries(CardSlots)
      .filter(([, slot]) => slot.capability !== Capability.Container)
      .map(([name]) => name)
    expect(interactive).toEqual(['overlay', 'dismiss'])
  })
})

describe('Card view', () => {
  it('draws every earned region with its text, the action in the header', () => {
    const card = view({
      title: 'Usage',
      description: 'This month',
      image: h.img([]),
      media: h.span([], ['icon']),
      action: h.span([], ['View']),
      content: h.span([], ['42 runs']),
      footer: h.span([], ['Updated just now']),
    })
    for (const text of ['Usage', 'This month', 'icon', 'View', '42 runs', 'Updated just now']) {
      expect(Inert.text(card)).toContain(text)
    }
    // The action is beside the title, in the header, not after the content.
    const header = Inert.children(card).find(node => Inert.byTag(node, 'h3').length > 0)
    expect(Inert.text(header)).toContain('View')
    expect(Inert.text(header)).not.toContain('42 runs')
    expect(Inert.byTag(card, 'img')).toHaveLength(1)
  })

  it('skips regions the card does not earn, and draws no control when it is not pressable', () => {
    const card = view({ content: h.span([], ['bare']) })
    expect(Inert.text(card)).toBe('bare')
    // The root and the content, nothing else.
    expect(Inert.all(card).filter(node => node.sel !== undefined)).toHaveLength(3)
    expect(overlayOf(card)).toBeUndefined()
    expect(Inert.value(card, 'data-pressable')).toBe('false')
  })

  it('stretches one button over a card that sends a Message, named by its title', () => {
    const card = view({ title: 'Starter', press: { onClick: message('Clicked') } })
    const overlay = overlayOf(card)
    expect(overlay?.sel).toBe('button')
    expect(Inert.value(overlay, 'aria-label')).toBe('Starter')
    expect(Inert.value(overlay, 'type')).toBe('button')
    expect(overlay?.data?.on?.['click']).toBeTypeOf('function')
    // Not a toggle unless it says whether it is chosen.
    expect(Inert.value(overlay, 'aria-pressed')).toBeUndefined()
    expect(Inert.value(card, 'data-pressable')).toBe('true')
  })

  it('says a chosen card is pressed, on the button and on the root', () => {
    for (const selected of [true, false]) {
      const card = view({ title: 'Pro', selected, press: { onClick: message('Clicked') } })
      expect(Inert.value(overlayOf(card), 'aria-pressed')).toBe(String(selected))
      expect(Inert.value(card, 'data-selected')).toBe(String(selected))
    }
  })

  it('disables the button and drops its Message when the card is disabled', () => {
    const card = view({ title: 'Pro', disabled: true, press: { onClick: message('Clicked') } })
    const overlay = overlayOf(card)
    expect(Inert.value(overlay, 'disabled')).toBe(true)
    expect(overlay?.data?.on?.['click']).toBeUndefined()
    expect(Inert.value(card, 'aria-disabled')).toBe('true')
    expect(Inert.value(card, 'data-disabled')).toBe('true')
  })

  it('stretches a link over a card that goes somewhere, and an external one says so', () => {
    const inside = overlayOf(view({ title: 'Docs', press: { href: '/docs' } }))
    expect(inside?.sel).toBe('a')
    expect(Inert.value(inside, 'href')).toBe('/docs')
    expect(Inert.value(inside, 'target')).toBeUndefined()

    const external = overlayOf(
      view({ title: 'GitHub', press: { href: 'https://github.com', external: true } }),
    )
    expect(Inert.value(external, 'target')).toBe('_blank')
    expect(Inert.value(external, 'rel')).toBe('noopener noreferrer')
    expect(Inert.value(external, 'aria-description')).toBe('Opens in a new tab')
  })

  it('marks a chosen link current, and a disabled one goes nowhere', () => {
    const current = overlayOf(view({ title: 'Home', selected: true, press: { href: '/' } }))
    expect(Inert.value(current, 'aria-current')).toBe('true')
    const disabled = overlayOf(view({ title: 'Home', disabled: true, press: { href: '/' } }))
    expect(Inert.value(disabled, 'href')).toBeUndefined()
    expect(Inert.value(disabled, 'aria-disabled')).toBe('true')
  })

  it('names the control by its label over the title, and refuses a pressable card with neither', () => {
    const labelled = view({
      title: 'Pro',
      label: 'Choose the Pro plan',
      press: { onClick: message('Clicked') },
    })
    expect(Inert.value(overlayOf(labelled), 'aria-label')).toBe('Choose the Pro plan')
    expect(() => view({ content: h.span([], []), press: { onClick: message('Clicked') } })).toThrow(
      /needs a `label`/,
    )
  })

  it('draws a dismiss button named for the card, revealed on hover unless always shown', () => {
    const hover = dismissOf(view({ title: 'Tip', dismiss: { onDismiss: message('Other') } }))
    expect(Inert.value(hover, 'aria-label')).toBe('Dismiss Tip')
    expect(Inert.value(hover, 'data-reveal')).toBe('hover')
    expect(hover?.data?.on?.['click']).toBeTypeOf('function')
    const always = dismissOf(
      view({
        title: 'Tip',
        dismiss: { onDismiss: message('Other'), label: 'Hide tip', always: true },
      }),
    )
    expect(Inert.value(always, 'aria-label')).toBe('Hide tip')
    expect(Inert.value(always, 'data-reveal')).toBe('always')
  })
})

describe('CardGroup view', () => {
  const cards = ['a', 'b', 'c'].map(key => ({ key, title: key.toUpperCase() }))

  it('places each card by row and column, keyed', () => {
    const drawn = group({ cards, columns: 2 })
    const items = itemsOf(drawn)
    expect(items.map(item => item.key)).toEqual(['a', 'b', 'c'])
    expect(
      items.map(item => [Inert.value(item, 'data-row'), Inert.value(item, 'data-column')]),
    ).toEqual([
      ['0', '0'],
      ['0', '1'],
      ['1', '0'],
    ])
    expect(Inert.style(Inert.byTag(drawn, 'ul')[0])['--fk-card-columns']).toBe('2')
  })

  it('marks a disabled card disabled where the highlight looks for it', () => {
    const drawn = group({ cards: [{ key: 'a', title: 'A', disabled: true }] })
    expect(Inert.value(itemsOf(drawn)[0], 'aria-disabled')).toBe('true')
  })

  it('follows the pointer with one highlight, reading both directions in a grid', () => {
    for (const [columns, axis] of [
      [1, 'y'],
      [3, 'xy'],
    ] as const) {
      const drawn = group({ cards, columns })
      expect(drawn?.data?.foldkitMount).toEqual({
        name: 'FluidHover',
        args: { name: CARD_HOVER, item: '[data-card-item]', axis, gapClick: true, gapReach: 16 },
      })
      const highlight = highlightOf(drawn)
      expect(highlight).toHaveLength(1)
      expect(Inert.value(highlight[0], 'aria-hidden')).toBe('true')
      // At rest until FluidHover writes, so the page reads defined values.
      expect(Inert.style(drawn)['--fk-card-hover-shown']).toBe('0')
    }
  })

  it('draws no highlight and attaches nothing without fluid hover', () => {
    const drawn = group({ cards, fluidHover: false })
    expect(drawn?.data?.foldkitMount).toBeUndefined()
    expect(highlightOf(drawn)).toHaveLength(0)
  })

  it("gives every card the group's card style unless it names its own", () => {
    const plain = Style.forSlots(CardSlots)(Recipes.Card({ surface: 'plain' }))
    const own = Style.forSlots(CardSlots)(Recipes.Card({ surface: 'filled' }))
    const drawn = group({
      cards: [
        { key: 'a', title: 'A' },
        { key: 'b', title: 'B', style: own },
      ],
      cardStyle: plain,
    })
    const [first, second] = itemsOf(drawn).map(item => Inert.children(item)[0])
    const plainClass = Inert.classes(view({ title: 'x', style: plain }))
    const ownClass = Inert.classes(view({ title: 'x', style: own }))
    expect(plainClass).not.toEqual(ownClass)
    expect(Inert.classes(first)).toEqual(plainClass)
    expect(Inert.classes(second)).toEqual(ownClass)
  })

  it.each([0, 1.5, -1])('refuses %s columns', columns => {
    expect(() => group({ cards, columns })).toThrow(/whole number/)
  })
})

describe('Card recipe', () => {
  const css = (selection: Parameters<typeof Recipes.Card>[0]): string =>
    Style.forSlots(CardSlots)(Recipes.Card(selection)).css

  it('stands an outlined card on the base surface, and a plain one on nothing', () => {
    expect(css({})).toMatch(/@layer variants\{[^@]*background:var\(--fk-surface-base\)/)
    expect(css({ surface: 'plain' })).not.toContain('background:var(--fk-surface-base)')
    expect(css({ surface: 'plain' })).toContain('background:transparent')
  })

  it('pads every region alike per selection, the image bleeding past it when stacked', () => {
    expect(css({})).toContain('--_fk-card-pad:var(--fk-space-md)')
    expect(css({ padding: 'roomy' })).toContain('--_fk-card-pad:var(--fk-space-lg)')
    expect(css({ padding: 'flush' })).toContain('--_fk-card-pad:0')
    expect(css({})).toContain('margin-inline:calc(-1 * var(--_fk-card-pad))')
    expect(css({ orientation: 'inline' })).not.toContain('margin-inline:calc(-1')
  })

  it('reveals the dismiss button from the card, and always on a touch screen', () => {
    const sheet = css({})
    expect(sheet).toMatch(
      /:is\(:hover, :focus-within\) > \.[\w-]+\[data-reveal="hover"\]\{opacity:1/,
    )
    expect(sheet).toMatch(/@media \(hover: none\)\{[^}]*\{opacity:1/)
  })
})

describe('CardGroup recipe', () => {
  const css = (selection: Parameters<typeof Recipes.CardGroup>[0]): string =>
    Style.forSlots(CardGroupSlots)(Recipes.CardGroup(selection)).css

  it('divides cards by their place, and spaces them apart instead when separated', () => {
    expect(css({})).toContain('[data-row="0"])')
    expect(css({})).toContain('[data-column="0"])')
    expect(css({ layout: 'separated' })).not.toContain('[data-row="0"])')
  })

  it("springs the highlight's place, scaled by whether it is moving", () => {
    expect(css({})).toContain(
      'calc(calc(var(--fk-motion-fast) * var(--fk-card-hover-moving)) * var(--fk-knob-travel))',
    )
    expect(css({})).toContain('var(--fk-motion-settle)')
  })
})
