/**
 * The Document: what a page is, stored.
 *
 * It is normalized: `roots` and each Region's array hold ids, and `nodes` holds
 * each node once, under its id. A node does not also store its own id, so an id
 * and its key cannot disagree. Order lives only in `roots` and in the Regions.
 *
 * This codec is tolerant on purpose. It accepts any well-formed Document: any
 * Block name, props as JSON. A page that uses a Block this deployment no longer
 * has still reads, round-trips and restores. Whether a Document fits a Catalog
 * is `Composition.validate`'s question, and `Composition.valid(catalog)` asks it
 * as a Schema check where that matters, such as an operation that publishes.
 */
import { Schema } from 'effect'

/** A node's identity, stable across edits, moves and migrations. */
export const NodeId = Schema.NonEmptyString.pipe(Schema.brand('@foldkit-composition/NodeId'))
export type NodeId = typeof NodeId.Type

export const Node = Schema.Struct({
  /** A Block's name, resolved against a Catalog. */
  block: Schema.String,
  /** The Block's props, encoded. */
  props: Schema.Record(Schema.String, Schema.Json),
  /** Each Region's children, in order. A Region with none may be absent. */
  regions: Schema.Record(Schema.String, Schema.Array(NodeId)),
  /** Reserved: a condition over the page's context that shows the node. */
  when: Schema.optional(Schema.Json),
  /** Reserved: the author's appearance choices. */
  appearance: Schema.optional(Schema.Json),
  /** Reserved: the actions the node's events reference, by name. */
  actions: Schema.optional(Schema.Record(Schema.String, Schema.Json)),
})
export type Node = typeof Node.Type

export const Document = Schema.Struct({
  /** The codec's own version, not the Catalog's. */
  format: Schema.Literal(1),
  roots: Schema.Array(NodeId),
  nodes: Schema.Record(NodeId, Node),
})
export type Document = typeof Document.Type

/** The ids of every node the Document holds, reachable or not. */
export const nodeIds = (document: Document): ReadonlyArray<NodeId> =>
  // A Record keyed by a brand gives its keys back as plain strings.
  Object.keys(document.nodes) as unknown as ReadonlyArray<NodeId>

/** A Document with nothing in it. */
export const empty = (): Document => ({ format: 1, roots: [], nodes: {} })

/** Where a node is: at the root, or in a parent's Region, at an index. */
export interface Place {
  readonly parent: NodeId | undefined
  readonly region: string | undefined
  readonly index: number
}

const places = new WeakMap<Document, ReadonlyMap<NodeId, Place>>()

/**
 * Where each node reachable from the roots is. Derived, never stored, and
 * computed once per Document value. A node reached twice is where it was first
 * reached; `validate` reports the second.
 */
export const index = (document: Document): ReadonlyMap<NodeId, Place> => {
  const known = places.get(document)
  if (known !== undefined) return known
  const found = new Map<NodeId, Place>()
  const visit = (id: NodeId, place: Place): void => {
    if (found.has(id) || document.nodes[id] === undefined) return
    found.set(id, place)
    for (const [region, children] of Object.entries(document.nodes[id].regions))
      children.forEach((child, at) => visit(child, { parent: id, region, index: at }))
  }
  document.roots.forEach((id, at) => visit(id, { parent: undefined, region: undefined, index: at }))
  places.set(document, found)
  return found
}
