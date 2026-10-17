/**
 * A tree view: rows of the size ladder, each indented a step per level by
 * `--fk-tree-level`, its chevron turning as it opens, the chosen row tinted
 * as a chosen row is. A row's group opens beneath it as a sidebar's links
 * do (`opensBelow`). The focus ring is the row's, since the
 * focused `treeitem` also holds the rows beneath it. A row's icon is muted
 * and a glyph's size; a checkable row's box fills in the accent with a
 * check, or a dash while mixed.
 *
 * `guides: 'lines'` draws a hairline down each open group under its row's
 * chevron, Zag's indent guide, so a deep tree's levels read at a glance;
 * `guides: 'none'` (the default) draws none.
 */
import { Style } from 'foldkit-mixins'
import { ladder } from 'foldkit-mixins/theme'
import { TreeViewSlots } from '../treeView.js'
import {
  component,
  cornerSides,
  opensBelow,
  ref,
  rowOnLadder,
  transition,
  travelled,
  unfilledHover,
  variant,
} from './design.js'

const list = { margin: '0', padding: '0', listStyle: 'none' }
const open = '[data-state="open"]'

const indent = ref.space.md
const chevronSize = '0.4em'
// A row's start: the row's own padding and a step per level above the first.
const rowStart = `calc(${ladder('row-pad')} + (var(--fk-tree-level, 1) - 1) * ${indent})`

export const TreeView = Style.recipeFor(TreeViewSlots)({
  base: {
    root: component(Style.self({ ...list, display: 'grid', gap: ref.space['3xs'] })),
    item: component(opensBelow(open), Style.self({ outline: 'none' })),
    row: component(
      Style.self({
        display: 'flex',
        alignItems: 'center',
        gap: ref.space.xs,
        ...rowOnLadder,
        paddingInlineStart: rowStart,
        borderRadius: ref.radius.md,
        color: ref.text.default,
        cursor: 'pointer',
        userSelect: 'none',
        ...transition('background-color, color'),
      }),
      Style.pseudo(':hover', { background: unfilledHover, color: ref.text.overt }),
      // `:is`, not `:where`, so a chosen or disabled row keeps its look under the pointer.
      Style.nest(':is([aria-selected="true"]) > &', {
        background: ref.accent.subtle,
        color: ref.accent.ink,
        fontWeight: ref.weight.medium,
      }),
      Style.nest(':where(:focus-visible) > &', {
        outline: `${ref.border.thick} solid ${ref.outline.focus}`,
        outlineOffset: '-2px',
      }),
      Style.nest(':is([aria-disabled="true"]) > &', { opacity: '0.5', cursor: 'not-allowed' }),
    ),
    // A right angle drawn in CSS, pointing along the row shut and down open.
    chevron: component(
      Style.self({
        flexShrink: '0',
        inlineSize: chevronSize,
        blockSize: chevronSize,
        ...cornerSides(ref.border.thick, 'currentColor'),
        rotate: '-45deg',
        transitionProperty: 'rotate',
        transitionDuration: travelled(ref.motion.fast),
        transitionTimingFunction: ref.motion.settle,
      }),
      // A leaf keeps the chevron's room, so its label lines up with its siblings'.
      Style.nest(':where(:not([aria-expanded])) > * > &', { visibility: 'hidden' }),
      Style.nest('&:where(:dir(rtl))', { rotate: '135deg' }),
      Style.nest(':where([aria-expanded="true"]) > * > &', { rotate: '45deg' }),
    ),
    checkbox: component(
      Style.self({
        position: 'relative',
        display: 'grid',
        placeItems: 'center',
        flexShrink: '0',
        inlineSize: '1em',
        blockSize: '1em',
        border: `${ref.border.thin} solid ${ref.outline.default}`,
        borderRadius: ref.radius.sm,
        background: ref.surface.base,
        cursor: 'pointer',
        ...transition('background-color, border-color'),
      }),
      Style.pseudo(':is([data-state="checked"], [data-state="mixed"])', {
        borderColor: ref.accent.default,
        background: ref.accent.default,
      }),
      Style.nest('&[data-state="checked"]::after', {
        content: '""',
        inlineSize: '0.28em',
        blockSize: '0.55em',
        ...cornerSides(ref.border.thick, ref.accent['on-fill']),
        rotate: '45deg',
        translate: '0 -10%',
      }),
      Style.nest('&[data-state="mixed"]::after', {
        content: '""',
        inlineSize: '0.55em',
        blockSize: ref.border.thick,
        background: ref.accent['on-fill'],
      }),
      Style.nest(':is([aria-disabled="true"]) > * > &', { cursor: 'not-allowed' }),
    ),
    icon: component(
      Style.self({
        display: 'inline-grid',
        placeItems: 'center',
        flexShrink: '0',
        inlineSize: '1.1em',
        blockSize: '1.1em',
        color: ref.text.muted,
      }),
      Style.nest('& > *', { inlineSize: '100%', blockSize: '100%' }),
    ),
    label: component(
      Style.self({
        minInlineSize: '0',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }),
    ),
    // The item's second grid row, clipped here while it opens.
    group: component(
      Style.self({
        ...list,
        display: 'grid',
        gap: ref.space['3xs'],
        minBlockSize: '0',
        overflow: 'hidden',
      }),
    ),
  },
  variants: {
    guides: {
      none: {},
      lines: {
        // Read on the group, inside its row's item, so the level is the row's.
        group: variant(
          Style.self({ position: 'relative' }),
          Style.nest('&::before', {
            content: '""',
            position: 'absolute',
            insetBlock: '0',
            insetInlineStart: `calc(${rowStart} + ${chevronSize} / 2)`,
            inlineSize: ref.border.thin,
            background: ref.outline.subtle,
          }),
        ),
      },
    },
  },
  defaults: { guides: 'none' },
})
