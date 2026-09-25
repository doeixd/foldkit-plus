/**
 * `foldkit-composition`: what a page is, as data.
 *
 * A Catalog of Blocks says what may exist; a Document says what does. The
 * Document is stored, validated against a Catalog, and edited by the
 * application's own transitions. This package performs no I/O, holds no state,
 * and draws nothing.
 */
import { describe } from './describe.js'
import { Document, Node, NodeId, empty, index } from './document.js'
import { valid, validate } from './validate.js'

export { Block, type AnyBlock, type PropsOf } from './block.js'
export { Catalog, type BlockDescription, type BlockName } from './catalog.js'
export { Content } from './content.js'
export { Document, Node, NodeId, type Place } from './document.js'
export { Region } from './region.js'
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
}
