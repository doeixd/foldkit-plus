/**
 * A listbox: the trigger shows the choice, the shared popup panel lists the
 * options with the chosen one tinted. `size` steps the trigger and the rows it
 * opens on the size ladder together; unset, they follow the region.
 */
import { Style } from 'foldkit-mixins'
import { ListboxSlots } from '../listbox.js'
import { component, disabled, focusRing, onLadder, ref, steps, transition } from './design.js'
import {
  backdrop,
  heading,
  highlight,
  indicator,
  item,
  mergedChoice,
  panel,
  rows,
  scroll,
  separator,
  triggerWidth,
  unlit,
} from './popup.js'
import { bar, thumb } from './scrollBars.js'

export const Listbox = Style.recipeFor(ListboxSlots)({
  base: {
    wrapper: component(Style.self({ position: 'relative', display: 'inline-block' })),
    button: component(
      Style.self({
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        inlineSize: '100%',
        ...onLadder,
        border: `${ref.border.thin} solid ${ref.outline.default}`,
        borderRadius: ref.radius.md,
        background: ref.surface.base,
        color: ref.text.default,
        font: 'inherit',
        cursor: 'pointer',
        ...transition('border-color, background-color'),
      }),
      Style.pseudo(':hover:not(:focus, :disabled)', { borderColor: ref.outline.overt }),
      focusRing,
      disabled,
    ),
    backdrop,
    items: panel,
    scroll,
    item: component(
      item,
      // The chosen row reads DOM state; its fill is the indicator's once that glides.
      Style.states({ true: { color: ref.accent.ink } }, 'aria-selected'),
      Style.nest(`${unlit}[aria-selected="true"]`, { background: ref.accent.subtle }),
      mergedChoice,
    ),
    heading,
    separator,
    rows,
    highlight,
    indicator,
    scrollBar: bar,
    scrollThumb: thumb,
  },
  variants: {
    size: {
      // On the wrapper, so the trigger and the rows it opens step together,
      // and on the panel too, which upstream portals out of the wrapper by default.
      sm: { wrapper: steps.sm, items: steps.sm },
      md: { wrapper: steps.md, items: steps.md },
    },
    width: {
      /** The panel at least as wide as the trigger, never narrower beside it. */
      trigger: { items: triggerWidth },
      auto: {},
    },
  },
  defaults: { width: 'auto' },
})
