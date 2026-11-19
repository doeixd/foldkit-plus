/**
 * `recipe.style(selection, options)` is `Style.forSlots(slots)(recipe(selection), options)`
 * in one call: the same classes, rules and layer, for a selection, for the
 * defaults, and on a recipe after `add` and `extend`.
 */
import { describe, expect, it } from 'vitest'
import {
  Attributes,
  Capability,
  Layers,
  Slot,
  Slots,
  SlotView,
  Style,
  type NamedStyle,
} from '../src/index.js'
import { h } from './resolverFixture.js'

const CardSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  title: Slot.make({ capability: Capability.Base }),
})

const Card = Style.recipeFor(CardSlots)({
  base: {
    root: Layers.standard.in('components', Style.self({ display: 'grid' })),
    title: Style.class('title'),
  },
  variants: {
    tone: {
      quiet: { root: Layers.standard.in('variants', Style.self({ color: 'gray' })) },
      loud: { root: Layers.standard.in('variants', Style.self({ color: 'red' })) },
    },
    size: {
      sm: { title: Style.self({ fontSize: '12px' }) },
      lg: { title: Style.self({ fontSize: '20px' }) },
    },
  },
  defaults: { tone: 'quiet' },
})

/** Everything a `NamedStyle` holds that a page reads, and what each Slot draws. */
const shown = (style: NamedStyle<typeof CardSlots>) => {
  const b = SlotView.buildersFor(CardSlots, [style.mixin], { input: {}, h })
  return {
    name: style.name,
    mixin: style.mixin.name,
    pieces: style.pieces,
    css: style.css,
    globalCss: style.globalCss,
    rules: style.rules,
    globalRules: style.globalRules,
    root: Attributes.find(b.root.attrs(), 'Class')?.value,
    title: Attributes.find(b.title.attrs(), 'Class')?.value,
  }
}

const app = { layer: Layers.standard.layer('app'), name: 'Card' }

describe('recipe.style', () => {
  it.each([
    ['a selection', Card, { tone: 'loud', size: 'lg' }],
    ['a selection that unsets a default', Card, { tone: null, size: 'sm' }],
    ['the defaults', Card, undefined],
    ['a recipe after add', Card.add({ tone: { soft: { title: Style.class('soft') } } }), {}],
    [
      'a recipe after extend',
      Card.extend({ base: { title: Style.self({ margin: '0' }) }, defaults: { size: 'lg' } }),
      {},
    ],
  ] as const)('gives what forSlots of the selection gives, for %s', (_, recipe, selection) => {
    const pick = selection as Parameters<typeof Card.style>[0]
    expect(shown(recipe.style(pick))).toEqual(shown(Style.forSlots(CardSlots)(recipe(pick))))
    expect(shown(recipe.style(pick, app))).toEqual(
      shown(Style.forSlots(CardSlots)(recipe(pick), app)),
    )
  })

  it('draws the selection, not the defaults', () => {
    const drawn = shown(Card.style({ tone: 'loud', size: 'lg' }))
    expect(drawn.css).toContain('color:red')
    expect(drawn.css).toContain('font-size:20px')
    expect(drawn.css).not.toContain('color:gray')
    expect(shown(Card.style()).css).toContain('color:gray')
  })

  it('places an unlayered piece in the layer it is given, and keeps a layered one', () => {
    const Extended = Card.extend({ base: { title: Style.self({ margin: '0' }) } })
    const { css } = Extended.style({}, app)
    expect(css).toMatch(/@layer app\{[^}]*\{margin:0\}/)
    expect(css).toMatch(/@layer components\{[^}]*\{display:grid\}/)
  })

  it('is a new style per call, as forSlots is', () => {
    expect(Card.style()).not.toBe(Card.style())
    expect(Style.forSlots(CardSlots)(Card())).not.toBe(Style.forSlots(CardSlots)(Card()))
  })
})
