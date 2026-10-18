/**
 * A listbox, and the custom select drawn over it: the trigger shows the
 * choice, the shared popup panel lists the options with the chosen one
 * tinted. `size` steps the trigger and the rows it opens on the size ladder
 * together; unset, they follow the region. With `Listbox.parts`, an option
 * is its icon, its label over a quieter description, and a check the chosen
 * row shows (`check`: at the row's `end`, its `start`, or `none`), and the
 * trigger its value, muted while it is the placeholder, before a chevron
 * that turns while open. `trigger` is the button's look: `outline`,
 * `filled` (the field fill), or `ghost` (no box until hovered).
 */
import { Style } from 'foldkit-mixins'
import { ladder, role } from 'foldkit-mixins/theme'
import { ListboxSlots } from '../listbox.js'
import {
  component,
  cornerSides,
  disabled,
  focusRing,
  onLadder,
  ref,
  steps,
  transition,
  triggerChevron,
  unfilledHover,
  variant,
} from './design.js'
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

/** An option's parts, which Listbox.parts and Combobox.parts draw; the two recipes share them. */
export const optionParts = {
  itemContent: component(
    Style.self({
      display: 'flex',
      flex: '1',
      alignItems: 'center',
      gap: ladder('gap'),
      minInlineSize: '0',
    }),
  ),
  itemIcon: component(
    Style.self({
      display: 'inline-grid',
      placeItems: 'center',
      flex: 'none',
      inlineSize: ladder('icon'),
      blockSize: ladder('icon'),
    }),
  ),
  itemText: component(Style.self({ display: 'grid', flex: '1', minInlineSize: '0' })),
  itemLabel: component(Style.self({ overflow: 'hidden', textOverflow: 'ellipsis' })),
  itemDescription: component(
    Style.self({
      // The panel's ink, quieter: muted text would not read on an inverted panel.
      color: `color-mix(in oklab, ${ref.popup.ink} 62%, transparent)`,
      ...role('caption'),
    }),
  ),
  // Two sides of a box, turned into a check; kept in place while hidden, so
  // the labels line up whichever row is chosen.
  itemCheck: component(
    Style.self({
      flex: 'none',
      inlineSize: '0.3em',
      blockSize: '0.6em',
      marginInline: '0.2em',
      marginBlockEnd: '0.15em',
      ...cornerSides(ref.border.thick, 'currentColor'),
      rotate: '45deg',
      visibility: 'hidden',
    }),
    Style.nest(':where([aria-selected="true"]) &', { visibility: 'visible' }),
  ),
} as const

/** Where an option's check sits: a selection of a `check` axis. */
export const checkAt = {
  end: {},
  start: { itemCheck: variant(Style.self({ order: '-1' })) },
  none: { itemCheck: variant(Style.self({ display: 'none' })) },
} as const

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
    ...optionParts,
    value: component(
      Style.self({
        display: 'flex',
        flex: '1',
        alignItems: 'center',
        gap: ladder('gap'),
        minInlineSize: '0',
      }),
    ),
    valueText: component(
      Style.self({
        flex: '1',
        overflow: 'hidden',
        textAlign: 'start',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }),
      Style.states({ true: { color: ref.text.muted } }, 'data-placeholder'),
    ),
    chevron: component(
      triggerChevron(':where([aria-expanded="true"]) &', '0.45em'),
      Style.self({ color: ref.text.muted }),
    ),
  },
  variants: {
    size: {
      // On the wrapper, so the trigger and the rows it opens step together,
      // and on the panel too, which upstream portals out of the wrapper by default.
      sm: { wrapper: steps.sm, items: steps.sm },
      md: { wrapper: steps.md, items: steps.md },
      lg: { wrapper: steps.lg, items: steps.lg },
    },
    trigger: {
      outline: {},
      filled: {
        button: variant(Style.self({ background: ref.surface.field, borderColor: 'transparent' })),
      },
      ghost: {
        button: variant(
          Style.self({ background: 'transparent', borderColor: 'transparent' }),
          Style.pseudo(':is(:hover, :active):not(:disabled, [aria-disabled="true"])', {
            background: unfilledHover,
            borderColor: 'transparent',
          }),
        ),
      },
    },
    check: checkAt,
    width: {
      /** The panel at least as wide as the trigger, never narrower beside it. */
      trigger: { items: triggerWidth },
      auto: {},
    },
  },
  defaults: { width: 'auto', trigger: 'outline', check: 'end' },
})
