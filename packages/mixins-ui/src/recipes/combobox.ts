/**
 * A combobox: a text field with a toggle, filtering the shared popup panel.
 * The chosen row is tinted; `size` is the density of the field and each row.
 */
import { Style } from 'foldkit-mixins'
import { ComboboxSlots } from '../combobox.js'
import {
  component,
  disabled,
  focusRing,
  focusWithin,
  hover,
  listScroll,
  ref,
  transition,
} from './design.js'
import { backdrop, density, heading, item, panel, separator } from './popup.js'

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
      focusWithin,
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
      hover({ color: ref.text.overt }),
      focusRing,
      disabled,
    ),
    backdrop,
    items: panel,
    scroll: listScroll,
    item: component(
      item,
      // The chosen row reads DOM state, so it goes through `states`.
      Style.states(
        { true: { background: ref.accent.subtle, color: ref.accent.ink } },
        'aria-selected',
      ),
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
