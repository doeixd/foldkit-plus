/**
 * A number field: a label over one bordered box holding the decrement, the
 * value and the increment, a rung of the size ladder tall, the value centered
 * in tabular figures. The steppers are quiet until hovered, and dim at their
 * bound.
 */
import { Style } from 'foldkit-mixins'
import { ladder, role } from 'foldkit-mixins/theme'
import { NumberFieldSlots } from '../numberField.js'
import { component, disabled, ref, touchText, transition, unfilledHover } from './design.js'

const stepper = component(
  Style.self({
    display: 'grid',
    placeItems: 'center',
    inlineSize: ladder('height'),
    padding: '0',
    border: '0',
    background: 'transparent',
    color: ref.text.muted,
    font: 'inherit',
    ...role('body'),
    cursor: 'pointer',
    ...transition('background-color, color'),
  }),
  Style.pseudo(':is(:hover, :active):not(:disabled)', {
    background: unfilledHover,
    color: ref.text.overt,
  }),
  Style.pseudo(':disabled', { opacity: '0.4', cursor: 'not-allowed' }),
)

export const NumberField = Style.recipeFor(NumberFieldSlots)({
  base: {
    root: component(Style.self({ display: 'flex', flexDirection: 'column', gap: ladder('gap') })),
    label: component(
      Style.self({ color: ref.text.overt, ...role('body'), fontWeight: ref.weight.medium }),
    ),
    group: component(
      Style.self({
        display: 'inline-grid',
        gridTemplateColumns: 'auto 1fr auto',
        alignItems: 'stretch',
        inlineSize: 'fit-content',
        minBlockSize: ladder('height'),
        border: `${ref.border.thin} solid ${ref.outline.default}`,
        borderRadius: ref.radius.md,
        background: ref.surface.base,
        overflow: 'hidden',
        ...transition('border-color'),
      }),
      Style.pseudo(':hover:not(:focus-within)', { borderColor: ref.outline.overt }),
      Style.pseudo(':focus-within', {
        outline: `${ref.border.thick} solid ${ref.outline.focus}`,
        outlineOffset: '2px',
      }),
    ),
    input: component(
      Style.self({
        inlineSize: '5ch',
        minInlineSize: '0',
        padding: '0',
        border: '0',
        background: 'transparent',
        color: ref.text.default,
        font: 'inherit',
        ...role('body'),
        textAlign: 'center',
        fontVariantNumeric: 'tabular-nums',
      }),
      // The group draws the ring around the whole field.
      Style.pseudo(':focus-visible', { outline: 'none' }),
      disabled,
      touchText,
    ),
    decrement: stepper,
    increment: stepper,
    description: component(Style.self({ margin: '0', color: ref.text.muted, ...role('caption') })),
  },
})
