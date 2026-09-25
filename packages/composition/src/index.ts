/**
 * `foldkit-composition`: what a page is, as data.
 *
 * A Catalog of Blocks says what may exist; a Document says what does. The
 * Document is stored, validated against a Catalog, and edited by the
 * application's own transitions. This package performs no I/O, holds no state,
 * and draws nothing.
 */
import { holds, when } from './condition.js'
import { statefulNodes } from './stateful.js'
import { describe } from './describe.js'
import { migrate, migration, promoteUnknown, renameBlock, renameProp } from './migrate.js'
import { Document, Node, NodeId, empty, index, newIds } from './document.js'
import { Operation, Op, Position, Tree, apply, rekey, region, root, takeTree } from './operation.js'
import { Url, isSafeUrl } from './url.js'
import { valid, validate } from './validate.js'

export {
  Block,
  type AnyBlock,
  type AppearanceAxes,
  type AppearanceAxis,
  type AppearanceChoice,
  type AppearanceFinding,
  type PropsFinding,
  type PropsOf,
} from './block.js'
export { Catalog, type BlockDescription, type BlockName } from './catalog.js'
export { Content } from './content.js'
export { Document, Node, NodeId, type Place } from './document.js'
export type { Migrated, Migration } from './migrate.js'
export {
  Operation,
  Position,
  Tree,
  type Applied,
  type Refusal,
  type RefusalCode,
} from './operation.js'
export { ActionRef, type ActionFinding, type CatalogAction } from './action.js'
export { Condition, When, type ConditionFinding } from './condition.js'
export type { StatefulNode } from './stateful.js'
export { Region } from './region.js'
export { Url, isSafeUrl } from './url.js'
export type { Diagnostic, DiagnosticCode } from './validate.js'

export const Composition = {
  /** The tolerant codec of a stored Document: any well-formed one, any Block name. */
  Document,
  Node,
  NodeId,
  /** A Document with nothing in it. */
  empty,
  /** Whether a Document fits a Catalog, as diagnostics. Reads, never repairs. */
  validate,
  /** `validate` as a Schema check: `Composition.Document.check(Composition.valid(Site))`. */
  valid,
  /** Where each reachable node is: its parent, Region and index. Derived, memoized per Document. */
  index,
  /** The Document as indented text, one node per line. */
  describe,
  /**
   * `Document + Operation → Document`, or a refusal with no partial result.
   * Checks what the Operation causes, not what was already wrong elsewhere.
   */
  apply,
  /** Operation constructors. */
  Op,
  /** Conditions for a node's `when`: `Op.setWhen(id, [Composition.when.eq('audience', 'member')])`. */
  when,
  /** Whether a stored `when` holds in a context; with no context, a node that has conditions does not show. */
  holds,
  /** The nodes whose Block is stateful, with decoded props: what a parent places a Bundle for. */
  statefulNodes,
  Operation,
  /** Positions: among the roots, or in a parent's Region. An index counts after the node moved is taken out. */
  root,
  region,
  Position,
  /** New node ids, as an Effect to run in a Command. */
  newIds,
  /** The subtree under a node, as a Pattern or a copy takes it. */
  takeTree,
  /** A subtree under new ids, every reference renamed; throws unless `ids` names each node once. */
  rekey,
  Tree,
  /**
   * Moves a stored Document forward through named migrations, in order. Each
   * rewrites a node or declines; one that breaks the structure throws.
   */
  migrate,
  /** A migration of one Block's nodes. */
  migration,
  /** Every node of one Block name becomes another. */
  renameBlock,
  /** A prop of one Block renamed, its value kept. */
  renameProp,
  /** Nodes of a Block the Catalog lost become a Block it has, when their props decode as its. */
  promoteUnknown,
  /** A URL a Document may hold: http, https, mailto, tel or relative, and nothing that runs. */
  Url,
  isSafeUrl,
}
