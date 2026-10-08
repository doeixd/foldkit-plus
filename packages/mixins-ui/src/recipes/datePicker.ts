/**
 * A date picker: a trigger button opening the month grid in a card. `size`
 * is the trigger's density. Note the universe: this adapter resolves in the
 * date picker's own Message, so an application draws the shell through its
 * own slots and resolves the embedded calendar separately; the recipe serves
 * a view composed in that universe.
 */
import { Style } from 'foldkit-mixins'
import { DatePickerSlots } from '../datePicker.js'
import { component, density, disabled, focusRing, ref, transition } from './design.js'

export const DatePicker = Style.recipeFor(DatePickerSlots)({
  base: {
    trigger: component(
      Style.self({
        display: 'inline-flex',
        alignItems: 'center',
        gap: ref.space.xs,
        border: `${ref.border.thin} solid ${ref.outline.default}`,
        borderRadius: ref.radius.md,
        background: ref.surface.base,
        color: ref.text.default,
        font: 'inherit',
        lineHeight: ref.leading.normal,
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
        background: ref.surface.base,
        boxShadow: ref.shadow.lg,
      }),
    ),
    backdrop: component(Style.self({ position: 'fixed', inset: '0' })),
  },
  variants: {
    size: {
      sm: { trigger: density(ref.space['2xs'], ref.space.sm, ref.size.sm) },
      md: { trigger: density(ref.space.xs, ref.space.md, ref.size.md) },
    },
  },
  defaults: { size: 'md' },
})
