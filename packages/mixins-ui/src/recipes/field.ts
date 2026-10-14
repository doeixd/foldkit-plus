/**
 * Text fields: `Input` and `Textarea` publish the same regions under
 * different control names, so both recipes are built from these pieces.
 */
import { Style, type StyleValue } from 'foldkit-mixins'
import { InputSlots } from '../input.js'
import { TextareaSlots } from '../textarea.js'
import { ladder } from 'foldkit-mixins/theme'
import {
  component,
  disabled,
  focusRing,
  focusWithin,
  onLadder,
  ref,
  steps,
  transition,
  variant,
} from './design.js'

const control = component(
  Style.self({
    display: 'block',
    inlineSize: '100%',
    border: `${ref.border.thin} solid ${ref.outline.default}`,
    borderRadius: ref.radius.md,
    background: ref.surface.base,
    color: ref.text.default,
    font: 'inherit',
    lineHeight: ref.leading.normal,
    ...onLadder,
    ...transition('border-color, background-color'),
  }),
  Style.pseudo(':hover:not(:focus, :disabled)', { borderColor: ref.outline.overt }),
  Style.pseudo('::placeholder', { color: ref.text.muted }),
  Style.pseudo('[aria-invalid="true"]', { borderColor: ref.error.outline }),
  focusRing,
  disabled,
)

const label = component(
  Style.self({
    display: 'block',
    marginBlockEnd: ref.space['2xs'],
    color: ref.text.overt,
    fontSize: ref.size.sm,
    fontWeight: ref.weight.medium,
  }),
)

const description = component(
  Style.self({
    marginBlockStart: ref.space['2xs'],
    color: ref.text.muted,
    fontSize: ref.size.sm,
  }),
)

const filled: StyleValue = variant(
  Style.self({ background: ref.surface.subtle, borderColor: 'transparent' }),
)
const outlined: StyleValue = variant(Style.self({ background: ref.surface.base }))

export const Input = Style.recipeFor(InputSlots)({
  base: { input: control, label, description },
  variants: {
    size: { sm: { input: steps.sm }, md: { input: steps.md }, lg: { input: steps.lg } },
    variant: { outline: { input: outlined }, filled: { input: filled } },
  },
  defaults: { variant: 'outline' },
})

export const Textarea = Style.recipeFor(TextareaSlots)({
  base: {
    // Lines rather than one: padded like a list row, and two lines tall at least.
    textarea: Style.compose(
      control,
      component(
        Style.self({
          resize: 'vertical',
          paddingBlock: ladder('row-pad'),
          minBlockSize: `calc(2lh + 2 * ${ladder('row-pad')})`,
        }),
      ),
    ),
    label,
    description,
  },
  variants: {
    size: { sm: { textarea: steps.sm }, md: { textarea: steps.md }, lg: { textarea: steps.lg } },
    variant: { outline: { textarea: outlined }, filled: { textarea: filled } },
  },
  defaults: { variant: 'outline' },
})

/**
 * A text field with a prefix or suffix, such as an address's `/`: pieces for
 * the application's own group, affix and control slots, drawn as one field.
 * The group carries the border, its hover and the focus ring (while the
 * control inside has focus); the affix sits inside it, muted; the control
 * inside goes borderless and transparent, so the two read as one box.
 */
export const InputGroup: {
  readonly group: StyleValue
  readonly affix: StyleValue
  readonly control: StyleValue
} = {
  group: component(
    Style.self({
      display: 'flex',
      alignItems: 'center',
      border: `${ref.border.thin} solid ${ref.outline.default}`,
      borderRadius: ref.radius.md,
      background: ref.surface.base,
      ...transition('border-color'),
    }),
    Style.pseudo(':hover:not(:focus-within)', { borderColor: ref.outline.overt }),
    focusWithin,
    Style.pseudo(':has([aria-invalid="true"])', { borderColor: ref.error.outline }),
  ),
  affix: component(
    Style.self({ color: ref.text.muted, paddingInlineStart: ladder('pad'), whiteSpace: 'nowrap' }),
  ),
  // In the variants layer, so it wins over a field's own look composed on the same slot.
  control: variant(
    Style.self({
      flex: '1',
      minInlineSize: '0',
      border: '0',
      background: 'transparent',
      paddingInlineStart: ref.space['3xs'],
    }),
    Style.pseudo(':focus-visible', { outline: 'none' }),
  ),
}
