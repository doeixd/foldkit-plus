/**
 * Compile-time Style contract. Type-checked, not executed.
 */
import {
  Capability,
  Layers,
  Slot,
  Slots,
  Style,
  Theme,
  type NamedStyle,
  type StylePieces,
  type StyleValue,
} from '../src/index.js'
import { FieldSlots } from './fixture.js'

const _ok = Style.forSlots(FieldSlots)({ root: Style.class('x') })
void _ok

// @ts-expect-error unknown slot key.
Style.forSlots(FieldSlots)({ missing: Style.class('x') })

// @ts-expect-error a hidden slot is internal, not publicly styleable.
Style.forSlots(FieldSlots)({ internals: Style.class('x') })

// @ts-expect-error inline declarations are string-valued.
Style.inline({ width: 3 })

// Declarations: camelCase CSS properties and custom properties, every piece.
Style.inline({ color: 'red', gridTemplateColumns: '1fr', '--gap': '1rem' })
Style.self({ WebkitLineClamp: '3', color: 'light-dark(#000, #fff)' })
// @ts-expect-error a misspelled property.
Style.inline({ colr: 'red' })
// @ts-expect-error kebab-case: the compiler writes kebab-case from camelCase.
Style.inline({ 'background-color': 'red' })
// @ts-expect-error a misspelled property in a rule piece.
Style.self({ paddng: '1rem' })
// @ts-expect-error in a pseudo rule.
Style.pseudo(':hover', { colr: 'red' })
// @ts-expect-error in a nested rule.
Style.nest('> span', { colr: 'red' })
// @ts-expect-error in a media rule.
Style.media('(min-width: 40rem)', { colr: 'red' })
// @ts-expect-error in a supports rule.
Style.supports('(display: grid)', { colr: 'red' })
// @ts-expect-error in a container rule.
Style.container('(min-width: 30rem)', { colr: 'red' })
// @ts-expect-error in a starting style.
Style.enter({ opcity: '0' })
// @ts-expect-error in a state.
Style.states({ open: { opcity: '1' } })
// @ts-expect-error in a keyframe.
Style.keyframes({ from: { opcity: '0' } })
// @ts-expect-error in a responsive breakpoint.
Style.responsive({ md: '(min-width: 48rem)' }, { md: { dispaly: 'flex' } })
// @ts-expect-error vars takes only custom properties.
Style.vars({ color: 'red' })

const IntentRecipe = Style.recipe({
  variants: { intent: { primary: Style.class('p'), secondary: Style.class('s') } },
})

IntentRecipe({ intent: 'primary' })
// @ts-expect-error unknown variant value.
IntentRecipe({ intent: 'ghost' })
// @ts-expect-error unknown variant key.
IntentRecipe({ size: 'sm' })

const Brand = Theme.define({ color: { text: '#000' } })
const BrandRef = Theme.ref(Brand)
const _text: string = BrandRef.color.text
void _text
// @ts-expect-error unknown theme group.
BrandRef.spacing
// @ts-expect-error unknown theme token.
BrandRef.color.missing

interface PredicateInput {
  readonly dark: boolean
}

Style.whenInput<PredicateInput>(input => input.dark, Style.class('dark'))

// @ts-expect-error a predicate must return boolean.
Style.whenInput<PredicateInput>(() => 1, Style.class('dark'))

const CompoundRecipe = Style.recipe({
  variants: {
    intent: { primary: Style.class('p'), ghost: Style.class('g') },
    size: { sm: Style.class('sm') },
  },
  compound: [{ when: { intent: 'primary', size: 'sm' }, style: Style.class('primary-sm') }],
})
void CompoundRecipe({ intent: 'primary', size: 'sm' })

Style.recipe({
  variants: { intent: { primary: Style.class('p') } },
  compound: [
    // @ts-expect-error unknown variant value in a compound.
    { when: { intent: 'ghost' }, style: Style.class('x') },
  ],
})

Style.recipe({
  variants: { intent: { primary: Style.class('p') } },
  compound: [
    // @ts-expect-error unknown variant key in a compound.
    { when: { colour: 'primary' }, style: Style.class('x') },
  ],
})

// A layer is named from its order, and only a bare piece goes through `in`:
// a slot style is layered where it is defined, with the `layer` option.
const LayerRoot = Slots.define({ root: Slot.make({ capability: Capability.Container }) })
const Placed = Style.forSlots(LayerRoot)(
  { root: Style.class('x') },
  { layer: Layers.standard.layer('app') },
)
// @ts-expect-error not a layer in the standard order
Layers.standard.layer('ap')
// @ts-expect-error Layers.in no longer takes a NamedStyle
Layers.standard.in('app', Placed)

// A slot recipe's selection names its axes and nothing else, with or without variants.
const BaseOnly = Style.recipeFor(LayerRoot)({ base: { root: Style.class('b') } })
BaseOnly()
BaseOnly({})
// @ts-expect-error a recipe with no variants takes no selection.
BaseOnly({ tone: 'quiet' })
const Toned = Style.recipeFor(LayerRoot)({
  variants: { tone: { quiet: { root: Style.class('q') } } },
})
Toned({ tone: 'quiet' })
Toned({ tone: null })
// @ts-expect-error a misspelled axis.
Toned({ tones: 'quiet' })
// @ts-expect-error an unknown value.
Toned({ tone: 'loud' })

const PlainBase = Style.recipe({ base: Style.class('b') })
PlainBase({})
// @ts-expect-error a recipe with no variants takes no selection.
PlainBase({ tone: 'quiet' })

// A selection's base slots are present; a variant's or a compound's may not be.
const Pair = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  label: Slot.make({ capability: Capability.Container }),
})
const Framed = Style.recipeFor(Pair)({
  base: { root: Style.class('r') },
  variants: { tone: { quiet: { label: Style.class('q') } } },
  defaults: { tone: 'quiet' },
})
const framed: StyleValue = Framed().root
void framed
// @ts-expect-error a variant's slot: `tone: null` leaves it out.
const framedLabel: StyleValue = Framed().label
void framedLabel
// `extend` adds its base's slots to those known.
const Labelled = Framed.extend({ base: { label: Style.class('l') } })
const labelled: readonly [StyleValue, StyleValue] = [Labelled().root, Labelled().label]
void labelled
// A partial result still fills a whole-contract style.
Style.forSlots(Pair)(Framed({ tone: null }))
// @ts-expect-error a base slot the contract lacks.
Style.recipeFor(Pair)({ base: { missing: Style.class('m') } })
// @ts-expect-error an extended base slot the contract lacks.
Framed.extend({ base: { missing: Style.class('m') } })
// @ts-expect-error a hidden slot is not styleable in a base either.
Style.recipeFor(FieldSlots)({ base: { internals: Style.class('i') } })
// `add` widens the selection by the values and axes it was given.
const Loud = Toned.add({ tone: { loud: { root: Style.class('l') } } })
Loud({ tone: 'loud' })
Loud({ tone: 'quiet' })
Loud({ tone: null })
// @ts-expect-error a value neither the recipe nor `add` gave.
Loud({ tone: 'shout' })
const Sized = Loud.add({ size: { sm: { root: Style.class('s') } } })
Sized({ tone: 'loud', size: 'sm' })
// @ts-expect-error an axis neither the recipe nor `add` gave.
Sized({ sizes: 'sm' })
// The inline curried form infers too.
Style.forSlots(LayerRoot)(
  Toned.add({ tone: { loud: { root: Style.class('l') } } })({ tone: 'loud' }),
)
// `extend` adjusts and defaults an added value.
Loud.extend({
  variants: { tone: { loud: { root: Style.class('l2') } } },
  defaults: { tone: 'loud' },
})
// @ts-expect-error a value the axis already has.
Toned.add({ tone: { quiet: { root: Style.class('q2') } } })
// @ts-expect-error a slot the contract lacks.
Toned.add({ tone: { loud: { missing: Style.class('m') } } })
// @ts-expect-error `extend` still refuses an axis the recipe lacks.
Toned.extend({ variants: { tones: { quiet: { root: Style.class('q') } } } })
// @ts-expect-error and, after `add`, a value neither gave.
Loud.extend({ variants: { tone: { shout: { root: Style.class('s') } } } })
// `add` keeps the slots the base surely holds.
const addedRoot: StyleValue = Framed.add({ tone: { loud: { label: Style.class('l') } } })().root
void addedRoot

// A base given as a `StylePieces` value names no slot it surely holds.
const loose: StylePieces<typeof Pair> = { root: Style.class('r') }
// @ts-expect-error `loose.root` may be absent.
const looseRoot: StyleValue = Style.recipeFor(Pair)({ base: loose })().root
void looseRoot

// A style of one contract is not another's, even when the two share a slot name (#595).
const Shared = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  day: Slot.make({ capability: Capability.Container }),
})
const Sibling = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  trigger: Slot.make({ capability: Capability.Container }),
})
const Whole = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  day: Slot.make({ capability: Capability.Container }),
  extra: Slot.make({ capability: Capability.Container }),
})
const sharedStyle = Style.forSlots(Shared)({ root: Style.class('a'), day: Style.class('b') })
const takesSibling = (style: NamedStyle<typeof Sibling>) => style
const takesShared = (style: NamedStyle<typeof Shared>) => style
const takesWhole = (style: NamedStyle<typeof Whole>) => style
// @ts-expect-error `root` is shared, but `day` is a slot the sibling lacks.
takesSibling(sharedStyle)
// A contract's own style, and the style of a contract whose slots it has all of, pass.
takesShared(sharedStyle)
takesWhole(sharedStyle)
// @ts-expect-error a style with a slot the asked-for contract lacks would drop its piece.
takesShared(Style.forSlots(Whole)({ root: Style.class('a') }))
