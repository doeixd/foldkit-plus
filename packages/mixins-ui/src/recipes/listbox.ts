/**
 * A listbox: the trigger shows the choice, the shared popup panel lists the
 * options with the chosen one tinted. `size` is the density of the trigger
 * and each row.
 */
import { Style } from 'foldkit-mixins'
import { ListboxSlots } from '../listbox.js'
import { component, disabled, focusRing, listScroll, ref, transition } from './design.js'
import {
  backdrop,
  density,
  heading,
  highlight,
  indicator,
  item,
  panel,
  rows,
  separator,
  unlit,
} from './popup.js'

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
      // The chosen row reads DOM state; its fill is the indicator's once that glides.
      Style.states({ true: { color: ref.accent.ink } }, 'aria-selected'),
      Style.nest(`${unlit}[aria-selected="true"]`, { background: ref.accent.subtle }),
    ),
    heading,
    separator,
    rows,
    highlight,
    indicator,
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
