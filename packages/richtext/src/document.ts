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
export const Heading = Schema.Struct({
  type: Schema.Literal('Heading'),
  id: NodeId,
  level: Schema.Literals([1, 2, 3, 4, 5, 6]),
  children: Schema.Array(Text),
})

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
 */
export const NodeBlock = Schema.Struct({
  type: Schema.Literal('Node'),
  kind: Schema.NonEmptyString,
  id: NodeId,
  props: Schema.JsonObject,
  children: Schema.Array(Text),
})
export type NodeBlock = typeof NodeBlock.Type

export const Block = Schema.Union([Paragraph, Heading, NodeBlock, UnknownBlock])
export type Block = typeof Block.Type

/** Version 1's initial block vocabulary, with document-wide identity validation. */
export const Document = Schema.Struct({
  version: Schema.Literal(1),
  children: Schema.Array(Block),
}).check(
  Schema.makeFilter(document => {
    const ids = new Set<NodeId>()
    for (const block of document.children) {
      for (const node of [block, ...block.children]) {
        if (ids.has(node.id)) return 'Duplicate node identity'
        ids.add(node.id)
      }
    }
    return true
  }),
)
export type Document = typeof Document.Type

const isKnownBlockType = (type: unknown): boolean =>
  type === 'Paragraph' || type === 'Heading' || type === 'Node'

/**
 * Converts blocks whose type this version does not implement into `Unknown`
 * nodes before structural decoding, so persisted content survives a deploy
 * that lost a node implementation. Everything except `type` and `id` becomes
 * opaque JSON props; the raw subtree is preserved there verbatim.
 */
const preserveUnknownBlocks = (input: unknown): unknown => {
  if (typeof input !== 'object' || input === null) return input
  const document = input as { children?: unknown }
  if (!Array.isArray(document.children)) return input
  return {
    ...document,
    children: document.children.map(block => {
      if (typeof block !== 'object' || block === null) return block
      const candidate = block as { type?: unknown; id?: unknown }
      if (isKnownBlockType(candidate.type) || candidate.type === 'Unknown') return block
      const { type, id, ...props } = block as Record<string, unknown>
      return { type: 'Unknown', id, originalType: type, props, children: [] }
    }),
  }
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
  const blocks = document.children.length
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

const isKnownMarkName = Schema.is(Mark)

/** A mark this vocabulary does not define, kept verbatim on its text run. */
export interface UnknownMark {
  readonly node: NodeId
  /** The mark's name; its props, if any, stay on the run. */
  readonly mark: string
}

/** Lists unknown marks per text run; empty means the document publishes cleanly. */
export const findUnknownMarks = (document: Document): ReadonlyArray<UnknownMark> =>
  document.children.flatMap(block =>
    block.children.flatMap(text =>
      text.marks
        .filter(mark => !isKnownMarkName(markName(mark)))
        .map(mark => ({ node: text.id, mark: markName(mark) })),
    ),
  )

/** A block this vocabulary does not implement, retained for migration. */
export interface UnknownNode {
  readonly node: NodeId
  readonly originalType: string
}

/** Lists preserved unknown blocks; empty means the document publishes cleanly. */
export const findUnknownNodes = (document: Document): ReadonlyArray<UnknownNode> =>
  document.children.flatMap(block =>
    block.type === 'Unknown' ? [{ node: block.id, originalType: block.originalType }] : [],
  )

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
        for (const block of document.children) {
          if (block.id === nodeId) return block
          for (const text of block.children) {
            if (text.id === nodeId) return text
          }
        }
        return undefined
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
  for (const block of document.children) {
    nodes.set(block.id, block)
    for (const text of block.children) nodes.set(text.id, text)
  }
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

/** Counts semantic nodes and UTF-16 text units; empty documents have depth zero. */
export const inspect = (document: Document) => ({
  nodeCount: document.children.reduce((count, block) => count + 1 + block.children.length, 0),
  textLength: document.children.reduce(
    (count, block) => count + block.children.reduce((length, text) => length + text.text.length, 0),
    0,
  ),
  depth: document.children.some(block => block.children.length > 0)
    ? 2
    : document.children.length > 0
      ? 1
      : 0,
})
