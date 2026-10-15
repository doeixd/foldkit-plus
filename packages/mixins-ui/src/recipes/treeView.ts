/**
 * A tree view: rows of the size ladder, each indented a step per level by
 * `--fk-tree-level`, its chevron turning as it opens, the chosen row tinted
 * as a chosen row is. A row's group opens beneath it as a sidebar's links
 * do (`opensBelow`). The focus ring is the row's, since the
 * focused `treeitem` also holds the rows beneath it.
 */
import { Style } from 'foldkit-mixins'
import { ladder } from 'foldkit-mixins/theme'
import { TreeViewSlots } from '../treeView.js'
import {
  component,
  opensBelow,
  ref,
  rowOnLadder,
  transition,
  travelled,
  unfilledHover,
} from './design.js'

const list = { margin: '0', padding: '0', listStyle: 'none' }
const open = '[data-state="open"]'

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
        paddingInlineStart: `calc(${ladder('row-pad')} + (var(--fk-tree-level, 1) - 1) * ${ref.space.md})`,
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
        inlineSize: '0.4em',
        blockSize: '0.4em',
        borderInlineEnd: `${ref.border.thick} solid currentColor`,
        borderBlockEnd: `${ref.border.thick} solid currentColor`,
        rotate: '-45deg',
        transitionProperty: 'rotate',
        transitionDuration: travelled(ref.motion.fast),
        transitionTimingFunction: ref.motion.settle,
      }),
      // A leaf keeps the chevron's room, so its label lines up with its siblings'.
      Style.nest(':where(:not([aria-expanded])) > * > &', { visibility: 'hidden' }),
      Style.nest(':where([dir="rtl"]) &', { rotate: '135deg' }),
      Style.nest(':where([aria-expanded="true"]) > * > &', { rotate: '45deg' }),
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
})
