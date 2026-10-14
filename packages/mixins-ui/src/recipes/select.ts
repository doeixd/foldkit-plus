/**
 * A native select: the same control look as a text field, with room for the
 * value. `size` and `variant` match the Input recipe's axes.
 */
import { Style } from 'foldkit-mixins'
import { SelectSlots } from '../select.js'
import { ladder } from 'foldkit-mixins/theme'
import {
  component,
  disabled,
  focusRing,
  onLadder,
  ref,
  steps,
  transition,
  variant,
} from './design.js'

export const Select = Style.recipeFor(SelectSlots)({
  base: {
    select: component(
      Style.self({
        display: 'block',
        inlineSize: '100%',
        ...onLadder,
        // Room for the native arrow at the end.
        paddingInline: `${ladder('pad')} 2rem`,
        border: `${ref.border.thin} solid ${ref.outline.default}`,
        borderRadius: ref.radius.md,
        background: ref.surface.base,
        color: ref.text.default,
        font: 'inherit',
        lineHeight: ref.leading.normal,
        appearance: 'none',
        ...transition('border-color, background-color'),
      }),
      Style.pseudo(':hover:not(:focus, :disabled)', { borderColor: ref.outline.overt }),
      Style.pseudo('::placeholder', { color: ref.text.muted }),
      // Invalidity reads DOM state, so it goes through `states`.
      Style.states({ true: { borderColor: ref.error.outline } }, 'aria-invalid'),
      focusRing,
      disabled,
    ),
    label: component(
      Style.self({
        display: 'block',
        marginBlockEnd: ref.space['2xs'],
        color: ref.text.overt,
        fontSize: ref.size.sm,
        fontWeight: ref.weight.medium,
      }),
    ),
    description: component(
      Style.self({
        marginBlockStart: ref.space['2xs'],
        color: ref.text.muted,
        fontSize: ref.size.sm,
      }),
    ),
  },
  variants: {
    size: {
      sm: { select: steps.sm },
      md: { select: steps.md },
      lg: { select: steps.lg },
    },
    variant: {
      outline: {
        select: variant(Style.self({ background: ref.surface.base })),
      },
      filled: {
        select: variant(Style.self({ background: ref.surface.subtle, borderColor: 'transparent' })),
      },
    },
  },
  defaults: { size: 'md', variant: 'outline' },
})
