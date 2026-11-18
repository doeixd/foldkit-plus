/**
 * A date picker: a trigger button opening the month grid in a card. `size`
 * steps the trigger and the grid on the size ladder. Note the universe: this adapter resolves in the
 * date picker's own Message, so an application draws the shell through its
 * own slots and resolves the embedded calendar separately; the recipe serves
 * a view composed in that universe.
 */
import { Style } from 'foldkit-mixins'
import { raise, raisedSurface } from 'foldkit-mixins/theme'
import { DatePickerSlots } from '../datePicker.js'
import {
  component,
  controlCorner,
  disabled,
  focusRing,
  onLadder,
  presence,
  ref,
  steps,
  transition,
} from './design.js'

export const DatePicker = Style.recipeFor(DatePickerSlots)({
  base: {
    trigger: component(
      Style.self({
        display: 'inline-flex',
        alignItems: 'center',
        ...onLadder,
        border: `${ref.border.thin} solid ${ref.outline.default}`,
        borderRadius: controlCorner,
        background: ref.surface.base,
        boxShadow: ref.shadow.field,
        color: ref.text.default,
        font: 'inherit',
        cursor: 'pointer',
        ...transition('border-color, background-color'),
      }),
      Style.pseudo(':hover:not(:focus, :disabled)', { borderColor: ref.outline.overt }),
      focusRing,
      disabled,
    ),
    panel: component(
      Style.self({
        padding: ref.space.md,
        minInlineSize: '18rem',
        border: `${ref.border.thin} solid ${ref.outline.subtle}`,
        borderRadius: ref.radius.lg,
        background: raisedSurface(),
        boxShadow: ref.shadow.lg,
      }),
      raise(2),
      // As the Popover's panel: it grows from the side it opened on and leaves the same way,
      // where `isAnimated` gives it states to leave by.
      Style.self({ transformOrigin: 'top' }),
      presence('fast', { scale: '1 0.96', translate: '0 -4px' }),
      Style.pseudo('[data-placement="top"]', { transformOrigin: 'bottom' }),
      Style.pseudo('[data-placement="top"][data-closed]', { translate: '0 4px' }),
    ),
    backdrop: component(Style.self({ position: 'fixed', inset: '0' })),
  },
  variants: {
    size: {
      sm: { trigger: steps.sm, panel: steps.sm },
      md: { trigger: steps.md, panel: steps.md },
    },
  },
})
