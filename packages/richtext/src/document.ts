import { Schema } from 'effect'

/** Caller-assigned identity, unique across blocks and text runs in a document. */
export const NodeId = Schema.NonEmptyString.pipe(Schema.brand('foldkit-richtext/NodeId'))
export type NodeId = typeof NodeId.Type

/** The mark names this vocabulary defines; a document may hold others verbatim. */
export const Mark = Schema.Literals(['Bold', 'Italic', 'Code'])
export type Mark = typeof Mark.Type

/** A schema this version can hand to `decodeUnknownSync` at a Kit boundary. */
export type PropsSchema = Schema.Codec<any, any, never>

/**
 * A mark with props: which mark, plus the JSON data it carries. Props are JSON
 * here for the same reason a node's are: the document codec cannot know an
 * application's schemas, so a Kit validates them at that boundary (§12).
 */
export const MarkValue = Schema.Struct({
  name: Schema.NonEmptyString,
  props: Schema.optionalKey(Schema.JsonObject),
})
export type MarkValue = typeof MarkValue.Type

/**
 * A mark as a text run stores it: a bare name for a mark with no props, or a
 * value when it has them. Loading preserves the form it found, so a names-only
 * document round-trips byte-equal, and because a run carries a name at most once
 * it never holds both forms of one mark.
 */
export const RunMark = Schema.Union([Schema.NonEmptyString, MarkValue])
export type RunMark = typeof RunMark.Type

/** A mark's name: a bare string is a mark with no props, an object carries them. */
export const markName = (mark: RunMark): string => (typeof mark === 'string' ? mark : mark.name)

/**
 * The content a block holds: runs, or nested blocks (§13). A document does not
 * declare which a block kind accepts — its Kit does — so these are the words a
 * declaration and a migration both use.
 */
export const textContent = 'text' as const
export const blockContent = 'blocks' as const
export type ContentMode = typeof textContent | typeof blockContent

/**
 * The wire shape of a value: the same structure with identities unbranded. A
 * branded `NodeId` encodes as a plain string, so an annotated schema whose type
 * mentions one cannot claim its encoded form is the type itself; this names the
 * wire side, which the recursive block schema needs to break its type cycle.
 */
type Wire<T> = T extends NodeId
  ? string
  : T extends ReadonlyArray<infer E>
    ? ReadonlyArray<Wire<E>>
    : T extends object
      ? { readonly [K in keyof T]: Wire<T[K]> }
      : T

export const Text = Schema.Struct({
  type: Schema.Literal('Text'),
  id: NodeId,
  text: Schema.String,
  // A mark name this version does not define loads verbatim; `Edit.addMark`
  // still accepts only what the caller's vocabulary declares. A run carries a
  // name at most once; see `findUnknownMarks` for the publishing gate.
  marks: Schema.Array(RunMark).check(
    Schema.makeFilter(
      marks => new Set(marks.map(markName)).size === marks.length || 'Invalid marks',
    ),
  ),
})
export type Text = typeof Text.Type

export const Paragraph = Schema.Struct({
  type: Schema.Literal('Paragraph'),
  id: NodeId,
  children: Schema.Array(Text),
})
export type Paragraph = typeof Paragraph.Type

export const Heading = Schema.Struct({
  type: Schema.Literal('Heading'),
  id: NodeId,
  level: Schema.Literals([1, 2, 3, 4, 5, 6]),
  children: Schema.Array(Text),
})
export type Heading = typeof Heading.Type

/**
 * A block whose `type` this version does not implement, retained verbatim for
 * recovery and migration: the original type, its remaining JSON fields, and no
 * text runs (its subtree lives in `props`, opaque). Unknown blocks are
 * read-only content: address them structurally, never edit their text.
 */
export const UnknownBlock = Schema.Struct({
  type: Schema.Literal('Unknown'),
  id: NodeId,
  originalType: Schema.NonEmptyString,
  props: Schema.JsonObject,
  children: Schema.Array(Text).check(
    Schema.makeFilter(runs => runs.length === 0 || 'Unknown blocks keep no text runs'),
  ),
})
export type UnknownBlock = typeof UnknownBlock.Type

/**
 * A block whose kind the application declares: a Callout, an Image, an embed.
 * `props` is JSON at the codec level because the document codec cannot know an
 * application's schemas; a Kit's node definition validates it at that boundary,
 * and runtime declarations stay outside the codec (§12). `children` are text
 * runs, so positions, operations, and selection work on it unchanged.
 *
 * `blocks` holds nested blocks, and its presence is what says the kind accepts
 * them (§116): a List holds ListItems, a Quote holds paragraphs. A kind with
 * nested blocks has no direct runs, which is why `children` stays `Text[]` on
 * every block kind — a container simply leaves it empty, as `UnknownBlock` does.
 *
 * The shape is written by hand because `Block` and this type are mutually
 * recursive, and TypeScript cannot infer through that cycle: the schema's
 * nested field names the interface, and the interface names the union.
 */
export interface NodeBlock {
  readonly type: 'Node'
  readonly kind: string
  readonly id: NodeId
  readonly props: Schema.JsonObject
  readonly children: ReadonlyArray<Text>
  readonly blocks?: ReadonlyArray<Block>
}

export const NodeBlock = Schema.Struct({
  type: Schema.Literal('Node'),
  kind: Schema.NonEmptyString,
  id: NodeId,
  props: Schema.JsonObject,
  children: Schema.Array(Text),
  blocks: Schema.optionalKey(
    Schema.suspend((): Schema.Codec<ReadonlyArray<Block>, Wire<ReadonlyArray<Block>>> =>
      Schema.Array(Block),
    ),
  ),
}).check(
  Schema.makeFilter(
    block =>
      block.blocks === undefined ||
      block.children.length === 0 ||
      'A block with nested blocks keeps no direct runs',
  ),
)

export type Block = Paragraph | Heading | NodeBlock | UnknownBlock
export const Block = Schema.Union([Paragraph, Heading, NodeBlock, UnknownBlock])

/** Every identity a block subtree owns, block and run alike, in document order. */
const subtreeIds = (block: Block): ReadonlyArray<NodeId> => [
  block.id,
  ...block.children.map(run => run.id),
  ...(block.type === 'Node' && block.blocks !== undefined ? block.blocks.flatMap(subtreeIds) : []),
]

/** Version 1's initial block vocabulary, with document-wide identity validation. */
export const Document = Schema.Struct({
  version: Schema.Literal(1),
  children: Schema.Array(Block),
}).check(
  Schema.makeFilter(document => {
    const ids = new Set<NodeId>()
    for (const block of document.children) {
      for (const id of subtreeIds(block)) {
        if (ids.has(id)) return 'Duplicate node identity'
        ids.add(id)
      }
    }
    return true
  }),
)
export type Document = typeof Document.Type

const isKnownBlockType = (type: unknown): boolean =>
  type === 'Paragraph' || type === 'Heading' || type === 'Node'

/**
 * Converts a block whose type this version does not implement into an `Unknown`
 * node, and does the same inside a known node block's nested blocks. Everything
 * except `type` and `id` becomes opaque JSON props; the raw subtree is preserved
 * there verbatim.
 */
const preserveBlock = (input: unknown): unknown => {
  if (typeof input !== 'object' || input === null) return input
  const block = input as Record<string, unknown>
  if (!isKnownBlockType(block.type) && block.type !== 'Unknown') {
    const { type, id, ...props } = block
    return { type: 'Unknown', id, originalType: type, props, children: [] }
  }
  return Array.isArray(block.blocks) ? { ...block, blocks: block.blocks.map(preserveBlock) } : block
}

/**
 * Converts blocks whose type this version does not implement into `Unknown`
 * nodes before structural decoding, so persisted content survives a deploy
 * that lost a node implementation. Nested blocks are walked for the same reason.
 */
const preserveUnknownBlocks = (input: unknown): unknown => {
  if (typeof input !== 'object' || input === null) return input
  const document = input as { children?: unknown }
  if (!Array.isArray(document.children)) return input
  return { ...document, children: document.children.map(preserveBlock) }
}

/** Strict boundary for persisted content. Throws a Schema error on invalid input. */
const decodeStructure = Schema.decodeUnknownSync(Document, { onExcessProperty: 'error' })

const PositiveCount = Schema.Number.check(Schema.isInt(), Schema.isGreaterThan(0))

/** Bounds for decoded documents: blocks, text runs, and total UTF-16 text units. */
export const DocumentLimits = Schema.Struct({
  maxBlocks: PositiveCount,
  maxTextRuns: PositiveCount,
  maxTextLength: PositiveCount,
})
export type DocumentLimits = typeof DocumentLimits.Type

/** Generous DoS guardrails, not application quotas; tighten per document with a spread. */
export const DefaultDocumentLimits: DocumentLimits = DocumentLimits.make({
  maxBlocks: 10_000,
  maxTextRuns: 50_000,
  maxTextLength: 5_000_000,
})

/** Every block a subtree holds, nested ones included. */
const countBlocks = (blocks: ReadonlyArray<Block>): number => {
  let count = 0
  eachBlock(blocks, () => {
    count += 1
  })
  return count
}

/**
 * Strict boundary for persisted content. Decodes structure first, then enforces
 * `limits`. Throws a Schema error on invalid input, or an Error naming the
 * first exceeded bound.
 */
export const decodeDocument = (
  input: unknown,
  limits: DocumentLimits = DefaultDocumentLimits,
): Document => {
  const document = decodeStructure(preserveUnknownBlocks(input))
  const summary = inspect(document)
  const blocks = countBlocks(document.children)
  const runs = summary.nodeCount - blocks
  if (blocks > limits.maxBlocks)
    throw new Error(`Document exceeds maxBlocks: ${blocks} > ${limits.maxBlocks}`)
  if (runs > limits.maxTextRuns)
    throw new Error(`Document exceeds maxTextRuns: ${runs} > ${limits.maxTextRuns}`)
  if (summary.textLength > limits.maxTextLength)
    throw new Error(
      `Document exceeds maxTextLength: ${summary.textLength} > ${limits.maxTextLength}`,
    )
  return document
}

/**
 * A block's address: root-first container indices. `[2]` is the third top-level
 * block, `[2, 0]` is the first block nested inside it (§116). A block's depth is
 * its path's length.
 */
export type BlockPath = ReadonlyArray<number>

/** A stable key for a block path, so paths can key maps and compare cheaply. */
export const pathKey = (path: BlockPath): string => path.join('.')

/** Walks every block subtree in document order, visiting each with its path. */
export const eachBlock = (
  blocks: ReadonlyArray<Block>,
  visit: (block: Block, path: BlockPath) => void,
  prefix: BlockPath = [],
): void => {
  for (const [index, block] of blocks.entries()) {
    const path = [...prefix, index]
    visit(block, path)
    if (block.type === 'Node' && block.blocks !== undefined) eachBlock(block.blocks, visit, path)
  }
}

/** A run's place in document order: its block's path, then its index in that block. */
export interface RunPlace {
  readonly path: BlockPath
  readonly index: number
}

/** A run with the identity it was found by. */
export interface LocatedRun extends RunPlace {
  readonly run: Text
}

/** Document order over run places: path first, then the run's index. */
export const compareRunPlaces = (left: RunPlace, right: RunPlace): number => {
  const shared = Math.min(left.path.length, right.path.length)
  for (let index = 0; index < shared; index++) {
    if (left.path[index] !== right.path[index]) return left.path[index]! - right.path[index]!
  }
  if (left.path.length !== right.path.length) return left.path.length - right.path.length
  return left.index - right.index
}

/** A position's place in document order: its run's place, then its offset in that run. */
export interface PositionPlace extends RunPlace {
  readonly offset: number
}

/** Document order over position places: the run first, then the offset within it. */
export const comparePositionPlaces = (left: PositionPlace, right: PositionPlace): number =>
  compareRunPlaces(left, right) || left.offset - right.offset

/** The block a path addresses, or undefined when the path does not resolve. */
export const blockAtPath = (document: Document, path: BlockPath): Block | undefined => {
  let blocks: ReadonlyArray<Block> = document.children
  let found: Block | undefined
  for (const index of path) {
    found = blocks[index]
    if (found === undefined) return undefined
    blocks = found.type === 'Node' && found.blocks !== undefined ? found.blocks : []
  }
  return found
}

/** The block with this identity, wherever it sits. */
export const locateBlock = (
  document: Document,
  node: NodeId,
): { readonly path: BlockPath; readonly block: Block } | undefined => {
  let found: { readonly path: BlockPath; readonly block: Block } | undefined
  eachBlock(document.children, (block, path) => {
    if (found === undefined && block.id === node) found = { path, block }
  })
  return found
}

/** The run with this identity, wherever it sits. */
export const locateRun = (document: Document, node: NodeId): LocatedRun | undefined => {
  let found: LocatedRun | undefined
  eachBlock(document.children, (block, path) => {
    if (found !== undefined) return
    const index = block.children.findIndex(run => run.id === node)
    if (index >= 0) found = { path, index, run: block.children[index]! }
  })
  return found
}

/**
 * The text of the block a position addresses, up to that position, in run order.
 * A menu reads this: what a query is typed into is the block's text between its
 * start and the caret, and a query never spans blocks. Affinity is not consulted — a
 * prefix ends between characters whatever side the caret leans to — an offset past a
 * run's end clamps to it, a negative one reads as none of it, and a position that
 * resolves to nothing gives an empty string.
 */
export const textBefore = (document: Document, position: Position): string => {
  const found = locateRun(document, position.node)
  if (found === undefined) return ''
  const block = blockAtPath(document, found.path)
  if (block === undefined) return ''
  const lead = block.children
    .slice(0, found.index)
    .map(earlier => earlier.text)
    .join('')
  return lead + found.run.text.slice(0, Math.max(0, position.offset))
}

/**
 * Whichever end of a range comes first in the document, whatever direction it was made in,
 * or `undefined` when either end does not resolve. What replaces a range starts here, so a
 * read of the text before an edit reads from this end rather than the anchor.
 */
export const rangeStart = (
  document: Document,
  range: Extract<Selection, { readonly type: 'Range' }>,
): Position | undefined => {
  const anchor = locateRun(document, range.anchor.node)
  const focus = locateRun(document, range.focus.node)
  if (anchor === undefined || focus === undefined) return undefined
  return comparePositionPlaces(
    { ...anchor, offset: range.anchor.offset },
    { ...focus, offset: range.focus.offset },
  ) <= 0
    ? range.anchor
    : range.focus
}

/**
 * The position a block's text offset addresses, or `undefined` when it is negative or past
 * the end. The inverse of `textBefore` for one block: a rule, a search match, or any producer
 * working in a block's own text needs it to say where what it found is.
 */
export const positionInBlock = (block: Block, offset: number): Position | undefined => {
  if (offset < 0) return undefined
  let consumed = 0
  for (const run of block.children) {
    const next = consumed + run.text.length
    if (offset <= next) {
      return {
        node: run.id,
        offset: offset - consumed,
        affinity: offset === next ? 'after' : 'before',
      }
    }
    consumed = next
  }
  return undefined
}

/**
 * The range covering the `length` characters before `position` in its block, or
 * `undefined` when the position does not resolve, `length` is not positive, or fewer
 * characters precede it. The inverse of `textBefore`: an input rule or a menu deletes
 * what it matched with this range, so removing the match and acting on it commit as one
 * action (§124 §5). Endpoints land at run boundaries with `after` affinity, which is
 * where a caret that typed that character would sit.
 */
export const textRangeBefore = (
  document: Document,
  position: Position,
  length: number,
): Selection | undefined => {
  if (length <= 0) return undefined
  const found = locateRun(document, position.node)
  if (found === undefined) return undefined
  const block = blockAtPath(document, found.path)
  if (block === undefined) return undefined
  const lead = block.children
    .slice(0, found.index)
    .reduce((total, run) => total + run.text.length, 0)
  // Clamped to the run as `textBefore` clamps, so an overlong offset never reads into the next run.
  const end = lead + Math.min(found.run.text.length, Math.max(0, position.offset))
  const start = end - length
  if (start < 0) return undefined
  const anchor = positionInBlock(block, start)
  const focus = positionInBlock(block, end)
  return anchor === undefined || focus === undefined ? undefined : { type: 'Range', anchor, focus }
}

/** Every node a block subtree owns, block and run alike, keyed by identity. */
const indexNodes = (blocks: ReadonlyArray<Block>, nodes: Map<NodeId, Block | Text>): void => {
  eachBlock(blocks, block => {
    nodes.set(block.id, block)
    for (const run of block.children) nodes.set(run.id, run)
  })
}

const isKnownMarkName = Schema.is(Mark)

/** A mark this vocabulary does not define, kept verbatim on its text run. */
export interface UnknownMark {
  readonly node: NodeId
  /** The mark's name; its props, if any, stay on the run. */
  readonly mark: string
}

/** Lists unknown marks per text run; empty means the document publishes cleanly. */
export const findUnknownMarks = (document: Document): ReadonlyArray<UnknownMark> => {
  const unknown: Array<UnknownMark> = []
  eachBlock(document.children, block => {
    for (const text of block.children) {
      for (const mark of text.marks) {
        const name = markName(mark)
        if (!isKnownMarkName(name)) unknown.push({ node: text.id, mark: name })
      }
    }
  })
  return unknown
}

/** A block this vocabulary does not implement, retained for migration. */
export interface UnknownNode {
  readonly node: NodeId
  readonly originalType: string
}

/** Lists preserved unknown blocks; empty means the document publishes cleanly. */
export const findUnknownNodes = (document: Document): ReadonlyArray<UnknownNode> => {
  const unknown: Array<UnknownNode> = []
  eachBlock(document.children, block => {
    if (block.type === 'Unknown') {
      unknown.push({ node: block.id, originalType: block.originalType })
    }
  })
  return unknown
}

/** UTF-16 offset in one text run, with insertion affinity at that offset. */
export const Position = Schema.Struct({
  node: NodeId,
  offset: Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
  affinity: Schema.Literals(['before', 'after']),
})
export type Position = typeof Position.Type

/** A reusable identity resolved against an explicit document, without owning its content. */
export interface NodeReference {
  readonly id: NodeId
  /** Returns the current node, or undefined if this document does not contain it. */
  readonly read: (document: Document) => Block | Text | undefined
  /** Describes a text position; application of an edit checks the target and bounds. */
  readonly at: (offset: number, affinity: Position['affinity']) => Position
}

export const Node = {
  /** Declares an immutable reference. Does not insert a node or reserve its ID. */
  make: (id: string): NodeReference => {
    const nodeId = NodeId.make(id)
    return Object.freeze({
      id: nodeId,
      read: (document: Document): Block | Text | undefined => {
        const nodes = new Map<NodeId, Block | Text>()
        indexNodes(document.children, nodes)
        return nodes.get(nodeId)
      },
      at: (offset: number, affinity: Position['affinity']): Position =>
        Position.make({ node: nodeId, offset, affinity }),
    })
  },
}

export const Selection = Schema.Union([
  Schema.Struct({ type: Schema.Literal('Range'), anchor: Position, focus: Position }),
  Schema.Struct({ type: Schema.Literal('Node'), node: NodeId }),
])
export type Selection = typeof Selection.Type

/** Validates references without sorting range endpoints or changing direction. */
export const selectionIsValid = (document: Document, selection: Selection | null): boolean => {
  if (selection === null) return true
  const nodes = new Map<NodeId, Block | Text>()
  indexNodes(document.children, nodes)
  if (selection.type === 'Node') return nodes.has(selection.node)
  return [selection.anchor, selection.focus].every(position => {
    const node = nodes.get(position.node)
    return (
      node?.type === 'Text' &&
      Number.isInteger(position.offset) &&
      position.offset >= 0 &&
      position.offset <= node.text.length
    )
  })
}

export const EditorState = Schema.Struct({
  document: Document,
  selection: Schema.NullOr(Selection),
}).check(
  Schema.makeFilter(
    state => selectionIsValid(state.document, state.selection) || 'Unresolved selection',
  ),
)
export type EditorState = typeof EditorState.Type

/**
 * Counts semantic nodes and UTF-16 text units, and reports nesting depth. Depth
 * counts levels of content: an empty document is 0, blocks are 1, runs inside a
 * block are 2, and a block nested inside a block adds a level (§116).
 */
export const inspect = (document: Document) => {
  let nodeCount = 0
  let textLength = 0
  let depth = 0
  eachBlock(document.children, (block, path) => {
    nodeCount += 1 + block.children.length
    for (const text of block.children) textLength += text.text.length
    depth = Math.max(depth, path.length + (block.children.length > 0 ? 1 : 0))
  })
  return { nodeCount, textLength, depth }
}
