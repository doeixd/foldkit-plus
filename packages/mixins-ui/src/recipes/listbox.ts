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
import { ListboxSlots } from '../listbox/slots.js'
import {
  component,
  controlCorner,
  cornerSides,
  disabled,
  filledHover,
  focusRing,
  hover,
  invalidEdge,
  invalidEdgeHeld,
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
import { stroke } from './tagsInput.js'

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
  // After the label, before the check: a code, a count, a badge, in the panel's quieter ink.
  itemTrailing: component(
    Style.self({
      flex: 'none',
      color: `color-mix(in oklab, ${ref.popup.ink} 62%, transparent)`,
      ...role('caption'),
    }),
  ),
  itemCheck: component(
    Style.self({
      flex: 'none',
      inlineSize: '0.3em',
      blockSize: '0.6em',
      marginInline: '0.2em',
      marginBlockEnd: '0.15em',
      ...cornerSides(ref.border.glyph, 'currentColor'),
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

/** The select's trigger: a field-like button showing the choice, which `Picker`'s opener shares. */
export const trigger = component(
  Style.self({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    inlineSize: '100%',
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
  // A disabled trigger is `aria-disabled`, which `:disabled` does not match;
  // an invalid one keeps its error edge under the pointer.
  Style.pseudo(
    ':hover:not(:focus, [aria-invalid="true"], :is([aria-disabled="true"], :disabled))',
    {
      borderColor: ref.outline.overt,
    },
  ),
  invalidEdge,
  focusRing,
  disabled,
)

/** The trigger's looks other than `outline`, a selection of a `trigger` axis. */
export const triggerLooks = {
  // A variant beats the base layer, so these write the invalid edge again.
  filled: variant(
    Style.self({ background: ref.surface.field, borderColor: 'transparent' }),
    filledHover,
    invalidEdge,
  ),
  ghost: variant(
    Style.self({ background: 'transparent', borderColor: 'transparent' }),
    hover({ background: unfilledHover, borderColor: 'transparent' }),
    invalidEdge,
    invalidEdgeHeld,
  ),
} as const

/** The clear button's side: small, but never under the touch floor `Defaults.reset` sets for a coarse pointer. */
const clearSize = 'max(1.5em, var(--fk-touch-floor, 0px))'

/** A quiet button that empties a choice: the Combobox's and the Listbox's. */
export const clearButton = component(
  Style.self({
    display: 'grid',
    placeItems: 'center',
    inlineSize: clearSize,
    blockSize: clearSize,
    padding: '0',
    border: '0',
    // Concentric with the control it sits in, which is 0.25em inside its own corner.
    borderRadius: `max(0px, calc(${controlCorner} - 0.25em))`,
    background: 'transparent',
    color: ref.text.muted,
    font: 'inherit',
    lineHeight: '1',
    cursor: 'pointer',
    // The strokes of the cross are placed in it; a use may place the button itself.
    position: 'relative',
    ...transition('background-color, color'),
  }),
  // With no content of its own the button is marked, and the sign is drawn as a chip's is.
  Style.nest('&[data-glyph="cross"]', { '--_fk-chip-sign': 'currentColor' }),
  Style.nest('&[data-glyph="cross"]::before', stroke('45deg')),
  Style.nest('&[data-glyph="cross"]::after', stroke('-45deg')),
  hover({ background: unfilledHover, color: ref.text.overt }),
  focusRing,
)

export const Listbox = Style.recipeFor(ListboxSlots)({
  base: {
    // The listbox and, while something is chosen, its clear button beside it.
    root: component(
      // As wide as the trigger even as a grid item, so the clear button lands in it.
      Style.self({ position: 'relative', display: 'inline-block', inlineSize: 'fit-content' }),
    ),
    clear: component(
      clearButton,
      Style.self({
        position: 'absolute',
        insetBlock: '0',
        marginBlock: 'auto',
        // Before the chevron, which keeps the trigger's end: its padding, its width and a gap.
        insetInlineEnd: `calc(${ladder('pad')} + 0.45em + ${ladder('gap')})`,
      }),
    ),
    wrapper: component(Style.self({ position: 'relative', display: 'inline-block' })),
    button: trigger,
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
      // Room for the clear button, which stands over the end of the value.
      Style.nest(':where([data-clearable]) &', {
        paddingInlineEnd: `calc(${clearSize} + ${ladder('gap')})`,
      }),
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
      filled: { button: triggerLooks.filled },
      ghost: { button: triggerLooks.ghost },
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
