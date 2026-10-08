/**
 * A listbox: the trigger shows the choice, the shared popup panel lists the
 * options with the chosen one tinted. `size` is the density of the trigger
 * and each row.
 */
import { Style } from 'foldkit-mixins'
import { ListboxSlots } from '../listbox.js'
import { component, disabled, focusRing, listScroll, ref, transition } from './design.js'
import { backdrop, density, heading, item, panel, separator } from './popup.js'

export const Listbox = Style.recipeFor(ListboxSlots)({
  base: {
    wrapper: component(Style.self({ position: 'relative', display: 'inline-block' })),
    button: component(
      Style.self({
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: ref.space.sm,
        inlineSize: '100%',
        paddingBlock: ref.space.xs,
        paddingInline: ref.space.sm,
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
        button: density(ref.space['2xs'], ref.space.xs, ref.size.sm),
        item: density(ref.space['3xs'], ref.space.sm, ref.size.sm),
      },
      md: {
        button: density(ref.space.xs, ref.space.sm, ref.size.md),
        item: density(ref.space['2xs'], ref.space.sm, ref.size.sm),
      },
    },
  },
  defaults: { size: 'md' },
})
