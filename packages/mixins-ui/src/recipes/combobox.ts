/**
 * A combobox: a text field with a toggle, filtering the shared popup panel.
 * The chosen row is tinted; `size` is the density of the field and each row.
 */
import { Style } from 'foldkit-mixins'
import { ComboboxSlots } from '../combobox.js'
import { component, disabled, focusRing, ref, transition } from './design.js'
import { backdrop, density, heading, item, panel, separator } from './popup.js'

const selected = '[aria-selected="true"]'

export const Combobox = Style.recipeFor(ComboboxSlots)({
  base: {
    wrapper: component(Style.self({ position: 'relative', display: 'inline-block' })),
    inputWrapper: component(
      Style.self({
        display: 'flex',
        alignItems: 'center',
        border: `${ref.border.thin} solid ${ref.outline.default}`,
        borderRadius: ref.radius.md,
        background: ref.surface.base,
        ...transition('border-color, background-color'),
      }),
      Style.pseudo(':hover:not(:focus-within)', { borderColor: ref.outline.overt }),
      Style.pseudo(':focus-within', {
        outline: `${ref.border.thick} solid ${ref.outline.focus}`,
        outlineOffset: '2px',
      }),
    ),
    input: component(
      Style.self({
        flex: '1',
        minInlineSize: '0',
        paddingBlock: ref.space.xs,
        paddingInline: ref.space.sm,
        border: '0',
        background: 'transparent',
        color: ref.text.default,
        font: 'inherit',
        lineHeight: ref.leading.normal,
      }),
      Style.pseudo(':focus-visible', { outline: 'none' }),
      Style.pseudo('::placeholder', { color: ref.text.muted }),
      disabled,
    ),
    toggleButton: component(
      Style.self({
        paddingBlock: ref.space.xs,
        paddingInline: ref.space.sm,
        border: '0',
        background: 'transparent',
        color: ref.text.muted,
        font: 'inherit',
        cursor: 'pointer',
      }),
      Style.pseudo(':hover:not([aria-disabled="true"], :disabled)', { color: ref.text.overt }),
      focusRing,
      disabled,
    ),
    backdrop,
    items: panel,
    scroll: component(Style.self({ maxBlockSize: '16rem', overflowY: 'auto' })),
    item: component(
      item,
      Style.pseudo(selected, { background: ref.accent.subtle, color: ref.accent.ink }),
    ),
    heading,
    separator,
  },
  variants: {
    size: {
      sm: {
        input: density(ref.space['2xs'], ref.space.xs, ref.size.sm),
        item: density(ref.space['3xs'], ref.space.sm, ref.size.sm),
      },
      md: {
        input: density(ref.space.xs, ref.space.sm, ref.size.md),
        item: density(ref.space['2xs'], ref.space.sm, ref.size.sm),
      },
    },
  },
  defaults: { size: 'md' },
})
