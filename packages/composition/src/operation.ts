/**
 * Operations: the transitions of a Document.
 *
 * `Document + Operation → Document`, pure and deterministic, or a refusal with
 * no partial result. Every Operation is Schema-backed data, so a keyboard
 * command, a drag, an agent and a replay all send the same thing. Every id an
 * Operation creates is in the Operation: `apply` never mints one.
 *
 * `apply` checks what the Operation itself would cause: a Region that would
 * not accept the node, a Region over its bound, a cycle, a taken id. It does not
 * refuse an edit because of something already wrong elsewhere in the Document,
 * so an author keeps working around content the deployment no longer knows.
 */
import { Result, Schema } from 'effect'
import { Block } from './block.js'
import { Catalog } from './catalog.js'
import { accepts } from './content.js'
import { Node, NodeId, index, type Document, type Place } from './document.js'
import { bounds } from './region.js'

/** Where a node goes: among the roots, or in a parent's Region, at an index. */
export const Position = Schema.Union([
  Schema.TaggedStruct('Root', { index: Schema.Int }),
  Schema.TaggedStruct('Region', { parent: NodeId, region: Schema.String, index: Schema.Int }),
])
export type Position = typeof Position.Type

const Props = Schema.Record(Schema.String, Schema.Json)

/** A subtree, keyed by id, with its root: what a Pattern or a paste inserts. */
export const Tree = Schema.Struct({ root: NodeId, nodes: Schema.Record(NodeId, Node) })
export type Tree = typeof Tree.Type

const Insert = Schema.TaggedStruct('Insert', {
  id: NodeId,
  block: Schema.String,
  props: Props,
  at: Position,
})
const InsertTree = Schema.TaggedStruct('InsertTree', { tree: Tree, at: Position })
const Remove = Schema.TaggedStruct('Remove', { id: NodeId })
const Move = Schema.TaggedStruct('Move', { id: NodeId, to: Position })
const Duplicate = Schema.TaggedStruct('Duplicate', {
  id: NodeId,
  ids: Schema.Record(NodeId, NodeId),
  at: Position,
})
const SetProp = Schema.TaggedStruct('SetProp', {
  id: NodeId,
  prop: Schema.String,
  value: Schema.Json,
})
const UnsetProp = Schema.TaggedStruct('UnsetProp', { id: NodeId, prop: Schema.String })
const SetWhen = Schema.TaggedStruct('SetWhen', { id: NodeId, when: Schema.NullOr(Schema.Json) })
const SetAppearance = Schema.TaggedStruct('SetAppearance', {
  id: NodeId,
  appearance: Schema.NullOr(Schema.Json),
})
const SetAction = Schema.TaggedStruct('SetAction', {
  id: NodeId,
  name: Schema.String,
  action: Schema.NullOr(Schema.Json),
})

type Single =
  | typeof Insert.Type
  | typeof InsertTree.Type
  | typeof Remove.Type
  | typeof Move.Type
  | typeof Duplicate.Type
  | typeof SetProp.Type
  | typeof UnsetProp.Type
  | typeof SetWhen.Type
  | typeof SetAppearance.Type
  | typeof SetAction.Type

export type Operation = Single | { readonly _tag: 'Batch'; readonly ops: ReadonlyArray<Operation> }

const Singles = [
  Insert,
  InsertTree,
  Remove,
  Move,
  Duplicate,
  SetProp,
  UnsetProp,
  SetWhen,
  SetAppearance,
  SetAction,
] as const

/** Every Operation, as a Schema: what an agent's tool, a log or a replay decodes. */
export const Operation: Schema.Codec<Operation, unknown> = Schema.Union([
  ...Singles,
  Schema.TaggedStruct('Batch', {
    ops: Schema.Array(Schema.suspend((): Schema.Codec<Operation, unknown> => Operation)),
  }),
]) as unknown as Schema.Codec<Operation, unknown>

export type RefusalCode =
  | 'composition:missing-node'
  | 'composition:id-taken'
  | 'composition:unknown-block'
  | 'composition:invalid-props'
  | 'composition:unknown-region'
  | 'composition:region-cardinality'
  | 'composition:region-rejects'
  | 'composition:root-rejects'
  | 'composition:cycle'
  | 'composition:bad-position'
  | 'composition:malformed-tree'
  | 'composition:nested'

/** Why an Operation was refused. The Document is as it was. */
export interface Refusal {
  readonly code: RefusalCode
  readonly message: string
}

/** What an applied Operation did. */
export interface Applied {
  readonly document: Document
  /** Nodes added or whose value changed, a parent whose Region changed included. */
  readonly changed: ReadonlyArray<NodeId>
  /** Nodes that are gone. */
  readonly removed: ReadonlyArray<NodeId>
}

class Refused extends Error {
  constructor(readonly refusal: Refusal) {
    super(refusal.message)
  }
}

const refuse = (code: RefusalCode, message: string): never => {
  throw new Refused({ code, message })
}

/** A Document being edited: its nodes copied once, and what changed recorded. */
interface Draft {
  readonly base: Document
  roots: ReadonlyArray<NodeId>
  readonly nodes: Record<NodeId, Node>
  readonly changed: Set<NodeId>
  readonly removed: Set<NodeId>
  /** Where nodes are, once a structural edit has made the base's index stale. */
  places: ReadonlyMap<NodeId, Place> | undefined
  moved: boolean
}

const nodeOf = (draft: Draft, id: NodeId): Node =>
  draft.nodes[id] ?? refuse('composition:missing-node', `"${id}" is not a node`)

const write = (draft: Draft, id: NodeId, node: Node): void => {
  draft.nodes[id] = node
  draft.changed.add(id)
  draft.removed.delete(id)
}

/** The structure changed: the base Document's index no longer says where nodes are. */
const moved = (draft: Draft): void => {
  draft.moved = true
  draft.places = undefined
}

/**
 * Where a node is now. Until a structural edit, the base Document's index
 * answers, computed once per Document value; after one, the draft's own.
 */
const placeOf = (draft: Draft, id: NodeId): Place | undefined => {
  if (!draft.moved) return index(draft.base).get(id)
  draft.places ??= index({ format: 1, roots: draft.roots, nodes: draft.nodes })
  return draft.places.get(id)
}

/** The node and every node it holds, in document order. */
const subtree = (draft: Draft, id: NodeId): ReadonlyArray<NodeId> => {
  const found = new Set<NodeId>()
  const visit = (at: NodeId): void => {
    if (found.has(at)) return
    found.add(at)
    const node = draft.nodes[at]
    if (node !== undefined)
      for (const children of Object.values(node.regions)) for (const child of children) visit(child)
  }
  visit(id)
  return [...found]
}

const blockOf = (catalog: Catalog, node: Node, id: NodeId) =>
  Catalog.block(catalog, node.block) ??
  refuse(
    'composition:unknown-block',
    `"${id}" is a "${node.block}", which this Catalog does not have, so it cannot be checked`,
  )

const checkProps = (catalog: Catalog, id: NodeId, node: Node): void => {
  const block = blockOf(catalog, node, id)
  const decoded = Block.decode(block, node.props)
  if (Result.isFailure(decoded))
    return refuse(
      'composition:invalid-props',
      `"${id}"'s props are not a ${block.name}'s: ${decoded.failure.message}`,
    )
  const [finding] = block.check(decoded.success)
  if (finding !== undefined)
    refuse('composition:nested', `"${id}"'s ${finding.path.join('.')}: ${finding.message}`)
}

/** The array a position points into, as it is now. */
const arrayAt = (catalog: Catalog, draft: Draft, at: Position): ReadonlyArray<NodeId> => {
  if (at._tag === 'Root') return draft.roots
  const parent = nodeOf(draft, at.parent)
  const block = blockOf(catalog, parent, at.parent)
  if (!Object.hasOwn(block.regions, at.region))
    refuse(
      'composition:unknown-region',
      `"${at.parent}" is a ${block.name}, which has no Region "${at.region}"`,
    )
  return parent.regions[at.region] ?? []
}

const describePosition = (at: Position): string =>
  at._tag === 'Root' ? `root ${at.index}` : `"${at.parent}"'s ${at.region} at ${at.index}`

/** Whether an index is within the array it points into; the end is within. */
const checkIndex = (at: Position, array: ReadonlyArray<NodeId>): void => {
  if (!Number.isInteger(at.index) || at.index < 0 || at.index > array.length)
    refuse(
      'composition:bad-position',
      `${describePosition(at)} is outside ${at._tag === 'Root' ? 'the roots' : `"${at.parent}"'s ${at.region}`}, which has ${array.length}`,
    )
}

/**
 * Whether `id` may go at `at`: the parent's Region accepts it and has room, or
 * the Catalog's roots accept it, and the index is within the array.
 */
const checkPlacement = (
  catalog: Catalog,
  draft: Draft,
  id: NodeId,
  at: Position,
  reorder = false,
): void => {
  const array = arrayAt(catalog, draft, at)
  checkIndex(at, array)
  const node = nodeOf(draft, id)
  // A Block the Catalog does not know may be reordered where it already is,
  // and nowhere else: nothing can say whether another place accepts it.
  if (reorder && Catalog.block(catalog, node.block) === undefined) return
  const block = blockOf(catalog, node, id)
  if (at._tag === 'Root') {
    if (!accepts(catalog.roots, block.provides))
      refuse(
        'composition:root-rejects',
        `a root must be ${catalog.roots.map(content => content.name).join(' or ')}, and "${id}" is a ${block.name}`,
      )
    return
  }
  const parentBlock = blockOf(catalog, nodeOf(draft, at.parent), at.parent)
  const region = parentBlock.regions[at.region]!
  if (!accepts(region.accepts, block.provides))
    refuse(
      'composition:region-rejects',
      `"${at.parent}"'s ${at.region} takes ${region.accepts.map(content => content.name).join(' or ')}, and "${id}" is a ${block.name}`,
    )
  if (array.length + 1 > region.max)
    refuse(
      'composition:region-cardinality',
      `"${at.parent}"'s ${at.region} holds ${array.length}, and takes ${bounds(region)}`,
    )
}

/** Puts an id into the array a position points into. */
const place = (draft: Draft, id: NodeId, at: Position): void => {
  const insert = (array: ReadonlyArray<NodeId>) => [
    ...array.slice(0, at.index),
    id,
    ...array.slice(at.index),
  ]
  moved(draft)
  if (at._tag === 'Root') {
    draft.roots = insert(draft.roots)
    return
  }
  const parent = nodeOf(draft, at.parent)
  write(draft, at.parent, {
    ...parent,
    regions: { ...parent.regions, [at.region]: insert(parent.regions[at.region] ?? []) },
  })
}

/**
 * Takes an id out of wherever it is placed. A Region left below its bound is
 * refused, since the Operation caused it, unless the node is going back into
 * the same Region (`staying`), as a reorder does.
 */
const unplace = (
  catalog: Catalog,
  draft: Draft,
  id: NodeId,
  staying: (where: Place) => boolean = () => false,
): void => {
  const where = placeOf(draft, id)
  if (where === undefined) return
  moved(draft)
  if (where.parent === undefined) {
    draft.roots = draft.roots.filter(root => root !== id)
    return
  }
  const parent = nodeOf(draft, where.parent)
  const regionName = where.region!
  const remaining = (parent.regions[regionName] ?? []).filter(child => child !== id)
  const parentBlock = Catalog.block(catalog, parent.block)
  const region = parentBlock?.regions[regionName]
  if (region !== undefined && remaining.length < region.min && !staying(where))
    refuse(
      'composition:region-cardinality',
      `"${where.parent}"'s ${regionName} would hold ${remaining.length}, and takes ${bounds(region)}`,
    )
  write(draft, where.parent, { ...parent, regions: { ...parent.regions, [regionName]: remaining } })
}

const drop = (draft: Draft, ids: ReadonlyArray<NodeId>): void => {
  for (const id of ids) {
    delete draft.nodes[id]
    draft.changed.delete(id)
    draft.removed.add(id)
  }
  moved(draft)
}

/**
 * A subtree to add, checked on its own: it is self-contained, its ids are free,
 * and each node fits the Catalog inside it. Where it goes is checked apart.
 */
const checkTree = (catalog: Catalog, draft: Draft, tree: Tree): ReadonlyArray<NodeId> => {
  const ids = Object.keys(tree.nodes) as unknown as ReadonlyArray<NodeId>
  if (tree.nodes[tree.root] === undefined)
    refuse('composition:malformed-tree', `the tree's root "${tree.root}" is not one of its nodes`)
  const reached = new Set<NodeId>()
  const visit = (id: NodeId): void => {
    if (reached.has(id)) refuse('composition:malformed-tree', `the tree reaches "${id}" twice`)
    const node =
      tree.nodes[id] ??
      refuse('composition:malformed-tree', `the tree names "${id}", which it does not hold`)
    reached.add(id)
    for (const children of Object.values(node.regions)) for (const child of children) visit(child)
  }
  visit(tree.root)
  for (const id of ids) {
    if (!reached.has(id))
      refuse('composition:malformed-tree', `the tree holds "${id}", which its root does not reach`)
    if (draft.nodes[id] !== undefined) refuse('composition:id-taken', `"${id}" is already a node`)
  }
  for (const id of ids) {
    const node = tree.nodes[id]!
    const block = blockOf(catalog, node, id)
    checkProps(catalog, id, node)
    for (const name of Object.keys(node.regions))
      if (!Object.hasOwn(block.regions, name))
        refuse(
          'composition:unknown-region',
          `"${id}" is a ${block.name}, which has no Region "${name}"`,
        )
    for (const [name, region] of Object.entries(block.regions)) {
      const children = node.regions[name] ?? []
      if (children.length < region.min || children.length > region.max)
        refuse(
          'composition:region-cardinality',
          `"${id}"'s ${name} holds ${children.length}, and takes ${bounds(region)}`,
        )
      for (const child of children) {
        const childBlock = blockOf(catalog, tree.nodes[child]!, child)
        if (!accepts(region.accepts, childBlock.provides))
          refuse(
            'composition:region-rejects',
            `"${id}"'s ${name} takes ${region.accepts.map(content => content.name).join(' or ')}, and "${child}" is a ${childBlock.name}`,
          )
      }
    }
  }
  return ids
}

/** Adds a checked subtree's nodes, then places its root. */
const addTree = (catalog: Catalog, draft: Draft, tree: Tree, at: Position): void => {
  checkTree(catalog, draft, tree)
  checkIndex(at, arrayAt(catalog, draft, at))
  for (const [id, node] of Object.entries(tree.nodes)) write(draft, id as NodeId, node)
  checkPlacement(catalog, draft, tree.root, at)
  place(draft, tree.root, at)
}

/** The subtree under a node, keyed by id, as a Pattern or a copy is taken. */
export const takeTree = (document: Document, id: NodeId): Tree => {
  const draft = start(document)
  const nodes = Object.fromEntries(subtree(draft, id).map(at => [at, nodeOf(draft, at)]))
  return { root: id, nodes }
}

/**
 * The same subtree under new ids: every id in it, and every reference between
 * them, renamed through `ids`, which must name each node once and nothing else.
 */
export const rekey = (tree: Tree, ids: Readonly<Record<NodeId, NodeId>>): Tree => {
  const held = Object.keys(tree.nodes)
  const given = Object.keys(ids)
  const missing = held.filter(id => !Object.hasOwn(ids, id))
  const extra = given.filter(id => !Object.hasOwn(tree.nodes, id))
  if (missing.length > 0 || extra.length > 0)
    refuse(
      'composition:malformed-tree',
      `new ids must name each node of the tree once: ${[
        ...missing.map(id => `"${id}" has none`),
        ...extra.map(id => `"${id}" is not in the tree`),
      ].join(', ')}`,
    )
  const fresh = Object.values(ids)
  if (new Set(fresh).size !== fresh.length)
    refuse('composition:malformed-tree', 'two nodes of the tree are given the same new id')
  const rename = (id: NodeId): NodeId => ids[id]!
  return {
    root: rename(tree.root),
    nodes: Object.fromEntries(
      Object.entries(tree.nodes).map(([id, node]) => [
        rename(id as NodeId),
        {
          ...node,
          regions: Object.fromEntries(
            Object.entries(node.regions).map(([name, children]) => [name, children.map(rename)]),
          ),
        },
      ]),
    ),
  }
}

const start = (document: Document): Draft => ({
  base: document,
  roots: document.roots,
  nodes: { ...document.nodes },
  changed: new Set(),
  removed: new Set(),
  places: undefined,
  moved: false,
})

const step = (catalog: Catalog, draft: Draft, op: Operation): void => {
  switch (op._tag) {
    case 'Insert': {
      if (draft.nodes[op.id] !== undefined)
        refuse('composition:id-taken', `"${op.id}" is already a node`)
      addTree(
        catalog,
        draft,
        { root: op.id, nodes: { [op.id]: { block: op.block, props: op.props, regions: {} } } },
        op.at,
      )
      return
    }
    case 'InsertTree':
      return addTree(catalog, draft, op.tree, op.at)
    case 'Remove': {
      nodeOf(draft, op.id)
      const gone = subtree(draft, op.id)
      unplace(catalog, draft, op.id)
      drop(draft, gone)
      return
    }
    case 'Move': {
      nodeOf(draft, op.id)
      if (op.to._tag === 'Region' && subtree(draft, op.id).includes(op.to.parent))
        refuse(
          'composition:cycle',
          `"${op.id}" cannot go inside itself, at ${describePosition(op.to)}`,
        )
      const to = op.to
      const from = placeOf(draft, op.id)
      // A reorder stays in the array it was in: it never leaves a Region short.
      const reorder =
        from !== undefined &&
        (to._tag === 'Root'
          ? from.parent === undefined
          : from.parent === to.parent && from.region === to.region)
      unplace(catalog, draft, op.id, () => reorder)
      checkPlacement(catalog, draft, op.id, to, reorder)
      place(draft, op.id, to)
      return
    }
    case 'Duplicate': {
      nodeOf(draft, op.id)
      const tree = rekey(
        takeTree({ format: 1, roots: draft.roots, nodes: draft.nodes }, op.id),
        op.ids,
      )
      addTree(catalog, draft, tree, op.at)
      return
    }
    case 'SetProp':
    case 'UnsetProp': {
      const node = nodeOf(draft, op.id)
      const props =
        op._tag === 'SetProp'
          ? { ...node.props, [op.prop]: op.value }
          : Object.fromEntries(Object.entries(node.props).filter(([key]) => key !== op.prop))
      const next = { ...node, props }
      checkProps(catalog, op.id, next)
      write(draft, op.id, next)
      return
    }
    case 'SetWhen':
    case 'SetAppearance': {
      const node = nodeOf(draft, op.id)
      const field = op._tag === 'SetWhen' ? 'when' : 'appearance'
      const value = op._tag === 'SetWhen' ? op.when : op.appearance
      const { [field]: _, ...rest } = node
      write(draft, op.id, value === null ? rest : { ...rest, [field]: value })
      return
    }
    case 'SetAction': {
      const node = nodeOf(draft, op.id)
      const { [op.name]: _, ...others } = node.actions ?? {}
      const actions = op.action === null ? others : { ...others, [op.name]: op.action }
      const { actions: __, ...rest } = node
      write(draft, op.id, Object.keys(actions).length === 0 ? rest : { ...rest, actions })
      return
    }
    case 'Batch':
      for (const inner of op.ops) step(catalog, draft, inner)
      return
  }
}

/**
 * Applies an Operation. Pure: the Document given is unchanged, and a refusal
 * returns no partial result, a batch's included.
 */
export const apply = (
  catalog: Catalog,
  document: Document,
  op: Operation,
): Result.Result<Applied, Refusal> => {
  const draft = start(document)
  try {
    step(catalog, draft, op)
  } catch (error) {
    if (error instanceof Refused) return Result.fail(error.refusal)
    throw error
  }
  return Result.succeed({
    document: { format: 1, roots: draft.roots, nodes: draft.nodes },
    changed: [...draft.changed],
    removed: [...draft.removed],
  })
}

/** Positions, as an Operation names them. */
export const root = (at: number): Position => ({ _tag: 'Root', index: at })
export const region = (parent: NodeId, name: string, at: number): Position => ({
  _tag: 'Region',
  parent,
  region: name,
  index: at,
})

/** Operation constructors: `Composition.Op.insert({ id, block, props, at })`. */
export const Op = {
  insert: (fields: Omit<typeof Insert.Type, '_tag'>): Operation => ({ _tag: 'Insert', ...fields }),
  insertTree: (fields: Omit<typeof InsertTree.Type, '_tag'>): Operation => ({
    _tag: 'InsertTree',
    ...fields,
  }),
  remove: (id: NodeId): Operation => ({ _tag: 'Remove', id }),
  move: (id: NodeId, to: Position): Operation => ({ _tag: 'Move', id, to }),
  duplicate: (fields: Omit<typeof Duplicate.Type, '_tag'>): Operation => ({
    _tag: 'Duplicate',
    ...fields,
  }),
  setProp: (id: NodeId, prop: string, value: Schema.Json): Operation => ({
    _tag: 'SetProp',
    id,
    prop,
    value,
  }),
  unsetProp: (id: NodeId, prop: string): Operation => ({ _tag: 'UnsetProp', id, prop }),
  setWhen: (id: NodeId, when: Schema.Json | null): Operation => ({ _tag: 'SetWhen', id, when }),
  setAppearance: (id: NodeId, appearance: Schema.Json | null): Operation => ({
    _tag: 'SetAppearance',
    id,
    appearance,
  }),
  setAction: (id: NodeId, name: string, action: Schema.Json | null): Operation => ({
    _tag: 'SetAction',
    id,
    name,
    action,
  }),
  batch: (ops: ReadonlyArray<Operation>): Operation => ({ _tag: 'Batch', ops }),
}
