/**
 * A native select: the same control look as a text field, with room for the
 * value and a chevron at its end. The browser's arrow is gone (`appearance:
 * none`) and a select has no pseudo-elements, so the chevron is two
 * gradients in the muted ink, at the inline end in either direction. A
 * select has no `::placeholder` either: while its chosen option is the empty
 * one (a placeholder), its text is muted, and the open list keeps the
 * default ink. `size` and `variant` match the Input recipe's axes.
 */
import { Style } from 'foldkit-mixins'
import { SelectSlots } from '../select.js'
import { ladder, role } from 'foldkit-mixins/theme'
import {
  component,
  controlCorner,
  disabled,
  focusRing,
  onLadder,
  ref,
  steps,
  touchText,
  transition,
  variant,
} from './design.js'

// Two halves of a square, each a diagonal of ink, meeting in a point below.
const half = (turn: string, ink: string) =>
  `linear-gradient(${turn}, transparent calc(50% - 0.5px), ${ink} 50%, transparent calc(50% + 1.5px))`
const chevron = {
  backgroundImage: `${half('45deg', ref.text.muted)}, ${half('-45deg', ref.text.muted)}`,
  backgroundSize: '0.375rem 0.375rem',
  backgroundRepeat: 'no-repeat',
}
// From the inline end: the right edge, or the left one right to left.
const at = (edge: 'right' | 'left') => ({
  backgroundPosition: `${edge} calc(${ladder('pad')} + 0.375rem) center, ${edge} ${ladder('pad')} center`,
})

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
        borderRadius: controlCorner,
        backgroundColor: ref.surface.base,
        boxShadow: ref.shadow.field,
        color: ref.text.default,
        font: 'inherit',
        appearance: 'none',
        ...chevron,
        ...at('right'),
        ...transition('border-color, background-color'),
      }),
      Style.pseudo(':dir(rtl)', at('left')),
      Style.pseudo(':hover:not(:focus, :disabled)', { borderColor: ref.outline.overt }),
      Style.pseudo(':has(option[value=""]:checked)', { color: ref.text.muted }),
      Style.nest('& option', { color: ref.text.default }),
      // Invalidity reads DOM state, so it goes through `states`.
      Style.states({ true: { borderColor: ref.error.outline } }, 'aria-invalid'),
      focusRing,
      disabled,
      touchText,
    ),
    label: component(
      Style.self({
        display: 'block',
        marginBlockEnd: ref.space['2xs'],
        color: ref.text.overt,
        ...role('body'),
        fontWeight: ref.weight.medium,
      }),
    ),
    description: component(
      Style.self({
        marginBlockStart: ref.space['2xs'],
        color: ref.text.muted,
        ...role('body'),
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
        select: variant(Style.self({ backgroundColor: ref.surface.base })),
      },
      filled: {
        select: variant(
          Style.self({ backgroundColor: ref.surface.field, borderColor: 'transparent' }),
        ),
      },
    },
  },
  defaults: { size: 'md', variant: 'outline' },
})
