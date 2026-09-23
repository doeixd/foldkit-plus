import { Schema } from 'effect'

/** Caller-assigned identity, unique across blocks and text runs in a document. */
export const NodeId = Schema.NonEmptyString.pipe(Schema.brand('foldkit-richtext/NodeId'))
export type NodeId = typeof NodeId.Type

export const Mark = Schema.Literals(['Bold', 'Italic', 'Code'])
export type Mark = typeof Mark.Type

export const Text = Schema.Struct({
  type: Schema.Literal('Text'),
  id: NodeId,
  text: Schema.String,
  marks: Schema.Array(Mark).check(
    Schema.makeFilter(marks => new Set(marks).size === marks.length || 'Duplicate mark'),
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
export const Block = Schema.Union([Paragraph, Heading])
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
  const document = decodeStructure(input)
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
