import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Message, Model, init, update, type TreeNode } from '../treeView.js'

/**
 * A row of `Bundles.TreeView`'s `nodes` arg: its structure, what keys,
 * typeahead and checks read. Its icons and content stay the view's, so a
 * `TreeNode` fits.
 */
export interface TreeStructureNode {
  readonly id: string
  readonly label: string
  readonly children?: ReadonlyArray<TreeStructureNode> | undefined
  readonly disabled?: boolean | undefined
}

const StructureNode: Schema.Codec<TreeStructureNode> = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
  children: Schema.optional(
    Schema.Array(Schema.suspend((): Schema.Codec<TreeStructureNode> => StructureNode)),
  ),
  disabled: Schema.optional(Schema.Boolean),
})

const Args = Schema.Struct({
  /** Prefixes every id the tree draws, unique on the page. */
  id: Schema.String,
  /** The tree's rows, which `update` reads the keys, typeahead and checks against. Give the view the same tree. */
  nodes: Schema.Array(StructureNode),
  open: Schema.optionalKey(Schema.Array(Schema.String)),
  checked: Schema.optionalKey(Schema.Array(Schema.String)),
  /** Each row has a box; stated once here, and the view reads it from the Model. */
  checkable: Schema.optionalKey(Schema.Boolean),
})

// `update` is built from the tree once: the args are one value for the life of a placement.
const folds = new WeakMap<ReadonlyArray<TreeNode>, ReturnType<typeof update>>()
const foldFor = (nodes: ReadonlyArray<TreeNode>) => {
  const known = folds.get(nodes)
  if (known !== undefined) return known
  const made = update(nodes)
  folds.set(nodes, made)
  return made
}

/**
 * A TreeView's state for `foldkit-bundle`: the current, open, chosen and
 * checked rows, with the tree's structure and `checkable` as the args, so
 * neither is given to `update` and the view again. The open and checked ids
 * are the tree's own, so a parent reads them from the placed Model. It holds
 * no view: draw the placed Model with `TreeView.view`, giving it the same
 * tree (with its icons, content and actions).
 */
export const TreeView = Bundle.make('TreeView', {
  Model,
  Message,
  args: Args,
  init: args => ({ model: init(args) }),
  update: (model, message, args) => foldFor(args.nodes)(model, message),
})
