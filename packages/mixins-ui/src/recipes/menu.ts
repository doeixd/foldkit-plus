/**
 * A menu, opened by a button or at a point: the trigger opens the shared
 * popup panel, whose rows commit on click, and a row that opens a submenu
 * ends in a chevron pointing the way the submenu opens. A checkbox row marks
 * itself with a tick and a radio row with a dot, in a column every row of
 * the menu keeps; a shortcut sits muted at the row's end; a destructive row
 * is in the danger ink and lights with its tint. The submenus' panels are
 * this recipe's too. `size` steps the trigger and its rows on the size
 * ladder.
 */
import { Style } from 'foldkit-mixins'
import { role } from 'foldkit-mixins/theme'
import { MenuSlots } from '../menu.js'
import {
  component,
  cornerSides,
  disabled,
  focusRing,
  hover,
  onLadder,
  ref,
  steps,
  unfilledHover,
} from './design.js'
import {
  backdrop,
  heading,
  highlight,
  item,
  panel,
  rows,
  scroll,
  separator,
  unlit,
} from './popup.js'
import { bar, thumb } from './scrollBars.js'

/** A destructive row's light: the danger fill, faint, so its ink still reads. */
const dangerTint = `color-mix(in oklab, ${ref.error.default} 14%, transparent)`

export const Menu = Style.recipeFor(MenuSlots)({
  base: {
    wrapper: component(Style.self({ position: 'relative', display: 'inline-block' })),
    button: component(
      Style.self({
        display: 'inline-flex',
        alignItems: 'center',
        ...onLadder,
        border: `${ref.border.thin} solid ${ref.outline.default}`,
        borderRadius: ref.radius.md,
        background: 'transparent',
        color: ref.text.default,
        font: 'inherit',
        fontWeight: ref.weight.medium,
        cursor: 'pointer',
      }),
      hover({ background: unfilledHover }),
      focusRing,
      // The contract lets the trigger disable, like the items it opens.
      disabled,
    ),
    backdrop,
    items: panel,
    scroll,
    item: Style.compose(
      item,
      component(
        Style.pseudo('[data-tone="destructive"]', { color: ref.error.ink }),
        Style.nest(
          `${unlit}[data-tone="destructive"]:is([data-active], :hover:not([aria-disabled="true"]))`,
          { background: dangerTint, color: ref.error.ink },
        ),
        Style.nest(':where([data-fluid-hover]) &[data-tone="destructive"][data-active]', {
          color: ref.error.ink,
        }),
      ),
    ),
    heading,
    separator,
    rows,
    // Under a destructive row the one highlight takes the danger tint.
    highlight: Style.compose(
      highlight,
      component(
        Style.nest(':where(:has([data-tone="destructive"][data-active])) > &', {
          background: dangerTint,
        }),
      ),
    ),
    scrollBar: bar,
    scrollThumb: thumb,
    label: component(Style.self({ flex: '1', minInlineSize: '0' })),
    // A column as wide as a mark, kept by every row of a menu that has one.
    check: component(
      Style.self({
        flex: 'none',
        display: 'inline-grid',
        placeItems: 'center',
        inlineSize: '1em',
        blockSize: '1em',
        marginInlineEnd: ref.space.xs,
      }),
      // A tick: two sides of a box, stood upright and turned.
      Style.nest('&[data-kind="checkbox"][data-checked="true"]::before', {
        content: '""',
        inlineSize: '0.3em',
        blockSize: '0.6em',
        ...cornerSides(ref.border.thick, 'currentColor'),
        rotate: '45deg',
        translate: '0 -0.1em',
      }),
      Style.nest('&[data-kind="radio"][data-checked="true"]::before', {
        content: '""',
        inlineSize: '0.4em',
        blockSize: '0.4em',
        borderRadius: ref.radius.full,
        background: 'currentColor',
      }),
    ),
    shortcut: component(
      Style.self({
        flex: 'none',
        marginInlineStart: ref.space.md,
        color: `color-mix(in oklab, currentColor 62%, transparent)`,
        ...role('caption'),
        letterSpacing: '0.08em',
      }),
      // A key combination reads left to right in every language: without a
      // direction of its own, a right to left row draws "⌘N" as "N⌘". On
      // the keys, not the slot, whose margin would then fall on the far side.
      Style.nest('& > *', { direction: 'ltr', unicodeBidi: 'isolate' }),
    ),
    // Two sides of a box, turned to point along the row.
    chevron: component(
      Style.self({
        flex: 'none',
        inlineSize: '0.4em',
        blockSize: '0.4em',
        marginInlineStart: ref.space.sm,
        ...cornerSides(ref.border.thick, 'currentColor'),
        color: ref.text.muted,
        rotate: '-45deg',
      }),
      Style.pseudo(':dir(rtl)', { rotate: '135deg' }),
    ),
    // A submenu is drawn inside its row, and the menu's panel scrolls: the
    // Anchor writes `overflow-y: auto` on it, which clipped away the submenu
    // placed beside it. While one shows, the panel holding it lets it out;
    // `!important`, since only that beats the Anchor's inline declaration.
    sub: component(
      Style.nest(':where([role="menu"]:has(&[data-open="true"]))', {
        overflow: 'visible !important',
      }),
    ),
  },
  variants: {
    size: {
      // On the wrapper, so the trigger and the rows it opens step together,
      // and on the panel too, which upstream portals out of the wrapper by default.
      sm: { wrapper: steps.sm, items: steps.sm },
      md: { wrapper: steps.md, items: steps.md },
    },
  },
})
