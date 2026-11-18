import { Behavior, Capability } from 'foldkit-mixins'
import { FluidHover } from 'foldkit-primitives/dom'
import { TreeViewSlots } from './slots.js'

// A row showing: its item neither disabled nor in a shut group, whose rows stay drawn.
const shownRow = '[role="treeitem"]:not([aria-disabled="true"], [inert] *) > :first-child'

/**
 * What moves the `highlight`: on the root, one highlight follows the pointer
 * to the nearest showing row, and to the row the keys focus, at its own
 * indentation. Pass it beside the style; until it runs, each row marks its
 * own hover and the drawn highlight shows nothing.
 */
export const fluid = [
  Behavior.forSlots(TreeViewSlots)<unknown, never>(
    {
      root: Behavior.slot({
        requires: { capability: Capability.Container },
        mount: () =>
          FluidHover({
            name: 'tree-hover',
            item: shownRow,
            axis: 'y',
            gapClick: true,
            // The focused `treeitem` holds its row and the rows beneath it.
            focused: ':scope:not([aria-disabled="true"]) > :first-child',
          }),
      }),
    },
    { name: 'TreeViewHover' },
  ).mixin,
] as const
