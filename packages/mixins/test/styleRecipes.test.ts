/**
 * The second Style slice: per-item pieces and stagger, the multi-slot recipe
 * with null deselect and extend, and forCapability over the lattice.
 */
import { describe, expect, it } from 'vitest'
import {
  Attributes,
  Capability,
  Slot,
  Slots,
  SlotView,
  Style,
  type SlotAttributes,
} from '../src/index.js'
import { DiagnosticError } from '../src/diagnostics.js'
import { h, type TestMessage } from './resolverFixture.js'

const CardSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  title: Slot.make({ capability: Capability.Base }),
  action: Slot.make({ capability: Capability.Focusable }),
  input: Slot.make({ capability: Capability.TextInput }),
  internals: { capability: Capability.Base, hidden: true },
})

const classOf = (attributes: SlotAttributes<TestMessage>): string =>
  Attributes.find(attributes, 'Class')?.value ?? ''
const styleOf = (attributes: SlotAttributes<TestMessage>): Readonly<Record<string, string>> =>
  Attributes.find(attributes, 'Style')?.value ?? {}
const codeOf = (f: () => unknown): string | undefined => {
  try {
    f()
    return undefined
  } catch (error) {
    if (error instanceof DiagnosticError) return error.diagnostic.code
    throw error
  }
}

describe('perItem and stagger', () => {
  const Rows = Style.forSlots(CardSlots)({
    title: Style.compose(
      Style.inline({ transition: 'opacity 200ms' }),
      Style.stagger({ stepMs: 40 }),
    ),
    action: Style.perItem(item => Style.class(item.index % 2 === 0 ? 'even' : 'odd')),
  })
  const b = SlotView.buildersFor(CardSlots, [Rows.mixin], { input: {}, h })

  it('computes a piece from the item the slot is rendered for', () => {
    expect(styleOf(b.title.attrs([], { index: 2 }))).toEqual({
      transition: 'opacity 200ms',
      '--fk-index': '2',
      transitionDelay: 'calc(var(--fk-index) * 40ms)',
    })
    expect(classOf(b.action.attrs([], { index: 3 }))).toBe('odd')
    expect(classOf(b.action.attrs([], { index: 4 }))).toBe('even')
  })

  it('contributes nothing per item to a slot rendered once', () => {
    expect(styleOf(b.title.attrs())).toEqual({ transition: 'opacity 200ms' })
    expect(classOf(b.action.attrs())).toBe('')
  })

  it('stagger can target animation-delay', () => {
    const piece = Style.stagger({ stepMs: 10, property: 'animationDelay' })
    const [only] = piece.items ?? []
    expect(only?.({ index: 1 }).style).toEqual({
      '--fk-index': '1',
      animationDelay: 'calc(var(--fk-index) * 10ms)',
    })
  })
})

describe('recipeFor', () => {
  const Card = Style.recipeFor(CardSlots)({
    base: { root: Style.class('card'), title: Style.class('title') },
    variants: {
      tone: {
        neutral: { root: Style.class('tone-neutral') },
        danger: { root: Style.class('tone-danger'), title: Style.class('title-danger') },
      },
      size: {
        sm: { root: Style.inline({ padding: '4px' }) },
        lg: { root: Style.inline({ padding: '16px' }) },
      },
    },
    defaults: { tone: 'neutral', size: 'sm' },
    compound: [{ when: { tone: 'danger', size: 'lg' }, style: { root: Style.class('loud') } }],
  })

  it('applies base, selected variants, defaults, and a matching compound per slot', () => {
    const pieces = Card({ tone: 'danger', size: 'lg' })
    expect(pieces.root?.classes).toEqual(['card', 'tone-danger', 'loud'])
    expect(pieces.root?.style).toEqual({ padding: '16px' })
    expect(pieces.title?.classes).toEqual(['title', 'title-danger'])
    expect(Card().root?.classes).toEqual(['card', 'tone-neutral'])
  })

  it('null unsets a defaulted axis', () => {
    const pieces = Card({ tone: null })
    expect(pieces.root?.classes).toEqual(['card'])
    expect(pieces.root?.style).toEqual({ padding: '4px' })
  })

  it('extend merges per slot and refuses a slot the contract lacks', () => {
    const Branded = Card.extend({
      base: { root: Style.class('brand') },
      variants: { tone: { danger: { root: Style.class('brand-danger') } } },
      defaults: { size: 'lg' },
    })
    expect(Branded({ tone: 'danger' }).root?.classes).toEqual([
      'card',
      'brand',
      'tone-danger',
      'brand-danger',
      'loud',
    ])
    expect(Card({ tone: 'danger' }).root?.classes).toEqual(['card', 'tone-danger'])
    expect(codeOf(() => Card.extend({ base: { footer: Style.class('x') } as never }))).toBe(
      'mixins:unknown-slot',
    )
    expect(
      codeOf(() =>
        Style.recipeFor(CardSlots)({ variants: { tone: { a: { nope: Style.empty } as never } } }),
      ),
    ).toBe('mixins:unknown-slot')
  })

  it('feeds forSlots', () => {
    const Named = Style.forSlots(CardSlots)(Card({ tone: 'danger' }))
    const b = SlotView.buildersFor(CardSlots, [Named.mixin], { input: {}, h })
    expect(classOf(b.root.attrs())).toBe('card tone-danger')
  })
})

describe('forCapability', () => {
  it('styles every public slot whose capability satisfies the one given', () => {
    const Ring = Style.forCapability(CardSlots)(Capability.Focusable, Style.class('ring'))
    expect(Object.keys(Ring.pieces).sort()).toEqual(['action', 'input'])
    const Everything = Style.forCapability(CardSlots)(Capability.Base, Style.class('x'))
    expect(Object.keys(Everything.pieces).sort()).toEqual(['action', 'input', 'root', 'title'])
    const b = SlotView.buildersFor(CardSlots, [Ring.mixin], { input: {}, h })
    expect(classOf(b.input.attrs())).toBe('ring')
    expect(classOf(b.title.attrs())).toBe('')
  })
})
