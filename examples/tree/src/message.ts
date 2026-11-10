/**
 * The tree's Messages, in a module of their own as upstream lays an app out:
 * its two placements' and the app's own, which its view sends.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { Selection, TreeNavigation } from 'foldkit-primitives/interaction'

export const Nav = Bundle.declare(TreeNavigation.bundle, 'nav')

export const Sel = Bundle.declare(Selection.bundle, 'selection')

export const Message = defineMessageUnion({
  ...Nav.cases,
  ...Sel.cases,
  CommittedCurrent: {},
  /** A branch row's expander was pressed: the tree opens or shuts it. */
  ToggledRow: { id: Schema.String },
})
export type Message = typeof Message.Type
