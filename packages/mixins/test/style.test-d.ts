/**
 * Compile-time Style contract. Type-checked, not executed.
 */
import { Capability, Layers, Slot, Slots, Style, Theme } from '../src/index.js'
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
