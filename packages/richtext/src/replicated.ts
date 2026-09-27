import { Schema } from 'effect'
import {
  NodeId,
  RunMark,
  type Block,
  type Document,
  type Position,
  type Selection,
  type Text,
} from './document.js'
import { markName, sameMarkSet } from './marks.js'
import { apply, TextBlock, type Operation, type TransactionResult } from './transaction.js'

/**
 * A document shared by several replicas, where every character has an identity that
 * outlives the edits around it.
 *
 * The editor keeps working on a plain `Document`: `project` derives one from this state.
 * An edit runs as an ordinary command against that projection, `translate` restates the
 * transactions it applied as `ReplicatedOp`s that name characters and blocks rather than
 * offsets and indices, and `applyOps` folds those ops into the state. Replicas converge
 * because a server gives every op one order and `applyOps` is a deterministic, total
 * function of the state and the ops: it never throws.
 */

/**
 * An identity this state minted: segments joined by `:`, at least two of them. The colon
 * keeps an id from ever naming an `Object.prototype` key, which is why the block record is
 * indexed directly, and the absent `.` is what separates an id from a character reference
 * built on it.
 */
export const ReplicatedId = Schema.String.check(
  Schema.isPattern(/^[A-Za-z0-9_-]+(?::[A-Za-z0-9_-]+)+$/),
).pipe(Schema.brand('foldkit-richtext/ReplicatedId'))
export type ReplicatedId = typeof ReplicatedId.Type

/** A character: the insert that created it, and its index within that insert's text. */
export const CharRef = Schema.String.check(
  Schema.isPattern(/^[A-Za-z0-9_-]+(?::[A-Za-z0-9_-]+)+\.(?:0|[1-9][0-9]*)$/),
).pipe(Schema.brand('foldkit-richtext/CharRef'))
export type CharRef = typeof CharRef.Type

const Index = Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0))

/** Characters `from` up to, not including, `to` of one insert. */
export const CharRange = Schema.Struct({ id: ReplicatedId, from: Index, to: Index })
export type CharRange = typeof CharRange.Type

/** What a block is, apart from its content and place. */
export const BlockShape = Schema.Union([
  Schema.Struct({ type: Schema.Literal('Paragraph') }),
  Schema.Struct({ type: Schema.Literal('Heading'), level: Schema.Literals([1, 2, 3, 4, 5, 6]) }),
  Schema.Struct({
    type: Schema.Literal('Node'),
    kind: Schema.NonEmptyString,
    props: Schema.JsonObject,
    /** What the node holds: runs, nested blocks, or nothing (an atom such as an image). */
    holds: Schema.Literals(['text', 'blocks', 'none']),
  }),
  Schema.Struct({
    type: Schema.Literal('Unknown'),
    originalType: Schema.NonEmptyString,
    props: Schema.JsonObject,
  }),
])
export type BlockShape = typeof BlockShape.Type

/** A stretch of one insert's characters with one mark set, visible or deleted. */
const Span = Schema.Struct({
  id: ReplicatedId,
  offset: Index,
  text: Schema.NonEmptyString,
  marks: Schema.Array(RunMark),
  deleted: Schema.Boolean,
})
type Span = typeof Span.Type

const Entry = Schema.Struct({
  shape: BlockShape,
  parent: Schema.NullOr(ReplicatedId),
  spans: Schema.Array(Span),
  /** Nested blocks in order, deleted ones included, so a sibling anchor still resolves. */
  children: Schema.Array(ReplicatedId),
  deleted: Schema.Boolean,
  /** Where a joined block's start now is: after this character of `into`, or its start. */
  joined: Schema.optionalKey(Schema.Struct({ into: ReplicatedId, after: Schema.NullOr(CharRef) })),
})
type Entry = typeof Entry.Type

export const ReplicatedState = Schema.Struct({
  version: Schema.Literal(1),
  root: Schema.Array(ReplicatedId),
  blocks: Schema.Record(ReplicatedId, Entry),
})
export type ReplicatedState = typeof ReplicatedState.Type

/**
 * One change, naming what it touches by identity. Inserts and splits anchor after a
 * character, or at a block's start when `after` is null; block ops anchor after a sibling,
 * or at the start of the container when `after` is null.
 */
export const ReplicatedOp = Schema.Union([
  Schema.Struct({
    type: Schema.Literal('Insert'),
    id: ReplicatedId,
    /** The block the anchor was in when the op was made: where a lost anchor falls back to. */
    block: ReplicatedId,
    after: Schema.NullOr(CharRef),
    text: Schema.NonEmptyString,
    marks: Schema.Array(RunMark),
  }),
  Schema.Struct({ type: Schema.Literal('Delete'), ranges: Schema.Array(CharRange) }),
  Schema.Struct({ type: Schema.Literal('Mark'), ranges: Schema.Array(CharRange), mark: RunMark }),
  Schema.Struct({
    type: Schema.Literal('Unmark'),
    ranges: Schema.Array(CharRange),
    name: Schema.NonEmptyString,
  }),
  Schema.Struct({
    type: Schema.Literal('InsertBlock'),
    id: ReplicatedId,
    shape: BlockShape,
    parent: Schema.NullOr(ReplicatedId),
    after: Schema.NullOr(ReplicatedId),
  }),
  Schema.Struct({ type: Schema.Literal('DeleteBlock'), id: ReplicatedId }),
  Schema.Struct({
    type: Schema.Literal('MoveBlock'),
    id: ReplicatedId,
    parent: Schema.NullOr(ReplicatedId),
    after: Schema.NullOr(ReplicatedId),
  }),
  Schema.Struct({
    type: Schema.Literal('Split'),
    block: ReplicatedId,
    after: Schema.NullOr(CharRef),
    into: ReplicatedId,
  }),
  Schema.Struct({ type: Schema.Literal('Join'), into: ReplicatedId, removed: ReplicatedId }),
  Schema.Struct({ type: Schema.Literal('Retype'), id: ReplicatedId, to: TextBlock }),
  Schema.Struct({ type: Schema.Literal('SetProps'), id: ReplicatedId, props: Schema.JsonObject }),
])
export type ReplicatedOp = typeof ReplicatedOp.Type

const charRef = (id: string, index: number): CharRef => `${id}.${index}` as CharRef
const parseChar = (ref: string): { readonly id: string; readonly index: number } => {
  const dot = ref.lastIndexOf('.')
  return { id: ref.slice(0, dot), index: Number(ref.slice(dot + 1)) }
}

/** The run a text block with no visible characters shows, so a caret has somewhere to be. */
const emptyRunId = (block: string): NodeId => NodeId.make(`${block}.0`)

export const empty: ReplicatedState = { version: 1, root: [], blocks: {} }

const lookup = (state: ReplicatedState, id: string): Entry | undefined =>
  state.blocks[id as ReplicatedId]

// ---------------------------------------------------------------------------------------
// Applying ops
// ---------------------------------------------------------------------------------------

/**
 * A working copy of the state for one `applyOps`: the block record is copied once, and each
 * entry the ops touch once, so a batch of ops costs one copy of what it touches.
 */
const draft = (state: ReplicatedState) => {
  const blocks: Record<string, Entry | undefined> = { ...state.blocks }
  let root = state.root
  let rootCopied = false
  const copied = new Set<string>()
  type Writable = { -readonly [K in keyof Entry]: Entry[K] } & {
    spans: Array<Span>
    children: Array<ReplicatedId>
  }
  const read = (id: string): Entry | undefined => blocks[id]
  const write = (id: string): Writable | undefined => {
    const entry = read(id)
    if (entry === undefined) return undefined
    if (copied.has(id)) return entry as Writable
    const copy: Writable = { ...entry, spans: [...entry.spans], children: [...entry.children] }
    blocks[id] = copy
    copied.add(id)
    return copy
  }
  const siblings = (parent: string | null): Array<ReplicatedId> | undefined => {
    if (parent === null) {
      if (!rootCopied) {
        root = [...root]
        rootCopied = true
      }
      return root as Array<ReplicatedId>
    }
    const entry = write(parent)
    return entry?.shape.type === 'Node' && entry.shape.holds === 'blocks'
      ? entry.children
      : undefined
  }
  const create = (id: string, entry: Entry): void => {
    blocks[id] = { ...entry, spans: [...entry.spans], children: [...entry.children] }
    copied.add(id)
  }
  const finish = (): ReplicatedState => ({
    version: 1,
    root,
    blocks: blocks as Record<ReplicatedId, Entry>,
  })
  return { read, write, siblings, create, finish, all: () => Object.keys(blocks) }
}
type Draft = ReturnType<typeof draft>

const holdsText = (shape: BlockShape): boolean =>
  shape.type === 'Paragraph' ||
  shape.type === 'Heading' ||
  (shape.type === 'Node' && shape.holds === 'text')

/** Whether an id already names a block or an insert anywhere in the state. */
const taken = (work: Draft, id: string): boolean =>
  work.read(id) !== undefined ||
  work.all().some(block => work.read(block)!.spans.some(span => span.id === id))

/** Where a character is: its block, and the span index and offset within that span. */
interface Found {
  readonly block: string
  readonly span: number
  readonly within: number
}

const findChar = (work: Draft, ref: string, hint: string | undefined): Found | undefined => {
  const { id, index } = parseChar(ref)
  const search = (block: string): Found | undefined => {
    const spans = work.read(block)?.spans ?? []
    for (const [span, candidate] of spans.entries()) {
      if (
        candidate.id === id &&
        index >= candidate.offset &&
        index < candidate.offset + candidate.text.length
      ) {
        return { block, span, within: index - candidate.offset }
      }
    }
    return undefined
  }
  const hinted = hint === undefined ? undefined : search(hint)
  if (hinted !== undefined) return hinted
  for (const block of work.all()) {
    const found = search(block)
    if (found !== undefined) return found
  }
  return undefined
}

/** Splits a block's span so a boundary falls `within` characters into it. */
const cut = (spans: Array<Span>, span: number, within: number): void => {
  const target = spans[span]!
  if (within <= 0 || within >= target.text.length) return
  spans.splice(
    span,
    1,
    { ...target, text: target.text.slice(0, within) },
    { ...target, offset: target.offset + within, text: target.text.slice(within) },
  )
}

/** A place between characters: a block, and how many of its spans come before it. */
interface Place {
  readonly block: string
  readonly index: number
}

/** The start of a block; a joined block's start is where its characters went. */
const startOf = (work: Draft, block: string, seen = new Set<string>()): Place | undefined => {
  const entry = work.read(block)
  if (entry === undefined || seen.has(block)) return undefined
  if (entry.joined === undefined) return { block, index: 0 }
  seen.add(block)
  return entry.joined.after === null
    ? startOf(work, entry.joined.into, seen)
    : afterChar(work, entry.joined.after, entry.joined.into)
}

/** The place right after a character, cutting its span so a boundary falls there. */
const afterChar = (work: Draft, ref: string, hint: string | undefined): Place | undefined => {
  const found = findChar(work, ref, hint)
  if (found === undefined) return undefined
  const spans = work.write(found.block)!.spans
  cut(spans, found.span, found.within + 1)
  return { block: found.block, index: found.span + 1 }
}

/** Every stretch of spans a set of ranges covers, cut so each lies wholly inside or out. */
const eachCovered = (
  work: Draft,
  ranges: ReadonlyArray<CharRange>,
  visit: (span: Span) => Span,
): void => {
  const ids = new Set(ranges.map(range => range.id))
  for (const block of work.all()) {
    if (!work.read(block)!.spans.some(span => ids.has(span.id))) continue
    const spans = work.write(block)!.spans
    for (const range of ranges) {
      for (let index = 0; index < spans.length; index++) {
        const span = spans[index]!
        if (span.id !== range.id) continue
        const end = span.offset + span.text.length
        if (range.to <= span.offset || range.from >= end) continue
        cut(spans, index, range.from - span.offset)
        const inside = spans[index]!
        if (inside.offset < range.from) continue
        cut(spans, index, range.to - inside.offset)
        spans[index] = visit(spans[index]!)
      }
    }
  }
}

const insertAfterSibling = (
  list: Array<ReplicatedId>,
  id: ReplicatedId,
  after: string | null,
): void => {
  const at = after === null ? 0 : list.indexOf(after as ReplicatedId) + 1
  // A sibling that has left this container puts the block at the container's end.
  list.splice(after !== null && at === 0 ? list.length : at, 0, id)
}

const isWithin = (work: Draft, block: string, ancestor: string): boolean => {
  for (let at: string | null = block; at !== null; at = work.read(at)?.parent ?? null) {
    if (at === ancestor) return true
  }
  return false
}

const applyOp = (work: Draft, op: ReplicatedOp): void => {
  switch (op.type) {
    case 'Insert': {
      if (taken(work, op.id)) return
      // A lost anchor (its insert was rejected) falls back to the end of the block the
      // op was made in, so the text is kept close to where it was typed.
      const fallback = (): Place | undefined => {
        const entry = work.read(op.block)
        return entry === undefined ? undefined : { block: op.block, index: entry.spans.length }
      }
      const place =
        (op.after === null ? startOf(work, op.block) : afterChar(work, op.after, op.block)) ??
        fallback()
      // A block that holds no text keeps the characters unshown, which is all a refusal
      // would do.
      if (place === undefined) return
      work.write(place.block)!.spans.splice(place.index, 0, {
        id: op.id,
        offset: 0,
        text: op.text,
        marks: op.marks,
        deleted: false,
      })
      return
    }
    case 'Delete':
      eachCovered(work, op.ranges, span => ({ ...span, deleted: true }))
      return
    case 'Mark':
      eachCovered(work, op.ranges, span => ({
        ...span,
        marks: [...span.marks.filter(mark => markName(mark) !== markName(op.mark)), op.mark],
      }))
      return
    case 'Unmark':
      eachCovered(work, op.ranges, span => ({
        ...span,
        marks: span.marks.filter(mark => markName(mark) !== op.name),
      }))
      return
    case 'InsertBlock': {
      if (taken(work, op.id)) return
      const list = work.siblings(op.parent)
      if (list === undefined) return
      insertAfterSibling(list, op.id, op.after)
      work.create(op.id, {
        shape: op.shape,
        parent: op.parent,
        spans: [],
        children: [],
        deleted: false,
      })
      return
    }
    case 'DeleteBlock': {
      const entry = work.read(op.id)
      if (entry === undefined) return
      work.write(op.id)!.deleted = true
      return
    }
    case 'MoveBlock': {
      const entry = work.read(op.id)
      if (entry === undefined) return
      if (
        op.parent !== null &&
        (work.read(op.parent) === undefined || isWithin(work, op.parent, op.id))
      )
        return
      const destination = work.siblings(op.parent)
      if (destination === undefined) return
      const source = work.siblings(entry.parent)!
      source.splice(source.indexOf(op.id), 1)
      insertAfterSibling(destination, op.id, op.after)
      work.write(op.id)!.parent = op.parent
      return
    }
    case 'Split': {
      if (taken(work, op.into)) return
      const place =
        op.after === null ? startOf(work, op.block) : afterChar(work, op.after, op.block)
      if (place === undefined) return
      const source = work.read(place.block)!
      if (!holdsText(source.shape)) return
      const list = work.siblings(source.parent)!
      const moved = work.write(place.block)!.spans.splice(place.index)
      insertAfterSibling(list, op.into, place.block)
      work.create(op.into, {
        shape: source.shape,
        parent: source.parent,
        spans: moved,
        children: [],
        deleted: source.deleted,
      })
      return
    }
    case 'Join': {
      const into = work.read(op.into)
      const removed = work.read(op.removed)
      if (into === undefined || removed === undefined) return
      if (removed.deleted || removed.joined !== undefined) return
      if (isWithin(work, op.into, op.removed) || isWithin(work, op.removed, op.into)) return
      const bothText = holdsText(into.shape) && holdsText(removed.shape)
      const bothBlocks =
        into.shape.type === 'Node' &&
        into.shape.holds === 'blocks' &&
        removed.shape.type === 'Node' &&
        removed.shape.holds === 'blocks'
      if (!bothText && !bothBlocks) return
      const last = into.spans[into.spans.length - 1]
      const target = work.write(op.into)!
      const gone = work.write(op.removed)!
      if (bothText) {
        target.spans.push(...gone.spans)
        gone.spans = []
      } else {
        for (const child of gone.children) work.write(child)!.parent = op.into
        target.children.push(...gone.children)
        gone.children = []
      }
      gone.deleted = true
      gone.joined = {
        into: op.into,
        after: last === undefined ? null : charRef(last.id, last.offset + last.text.length - 1),
      }
      return
    }
    case 'Retype': {
      const entry = work.read(op.id)
      if (entry?.shape.type !== 'Paragraph' && entry?.shape.type !== 'Heading') return
      work.write(op.id)!.shape = op.to
      return
    }
    case 'SetProps': {
      const entry = work.read(op.id)
      if (entry?.shape.type !== 'Node') return
      work.write(op.id)!.shape = { ...entry.shape, props: { ...entry.shape.props, ...op.props } }
      return
    }
  }
}

const applied = new WeakMap<
  ReplicatedState,
  WeakMap<ReadonlyArray<ReplicatedOp>, ReplicatedState>
>()

/**
 * Folds ops into the state in order. Total: an op whose target is gone, whose ids are
 * already taken, or that would make the tree cyclic changes nothing, and one anchored on
 * a character that never arrived lands at the end of the block it names.
 *
 * The same ops on the same state give back the same state object, so the edit that made
 * the ops and the durable Message that replays them agree on identity, and whatever is
 * derived from it (`project`, an editor host's key) is derived once.
 */
export const applyOps = (
  state: ReplicatedState,
  ops: ReadonlyArray<ReplicatedOp>,
): ReplicatedState => {
  if (ops.length === 0) return state
  const known = applied.get(state)?.get(ops)
  if (known !== undefined) return known
  const work = draft(state)
  for (const op of ops) applyOp(work, op)
  const next = work.finish()
  const byOps = applied.get(state) ?? new WeakMap()
  byOps.set(ops, next)
  applied.set(state, byOps)
  return next
}

// ---------------------------------------------------------------------------------------
// Projection
// ---------------------------------------------------------------------------------------

/** A projected run and the characters it shows, in order. */
interface ProjectedRun {
  readonly id: NodeId
  readonly chars: ReadonlyArray<CharRange>
}

interface Projection {
  readonly document: Document
  /** The runs of every visible block that holds text, in order. */
  readonly runs: ReadonlyMap<string, ReadonlyArray<ProjectedRun>>
}

const appendChars = (chars: Array<CharRange>, id: ReplicatedId, from: number, to: number) => {
  const last = chars[chars.length - 1]
  if (last !== undefined && last.id === id && last.to === from) {
    chars[chars.length - 1] = { id, from: last.from, to }
  } else {
    chars.push({ id, from, to })
  }
}

const projectRuns = (
  block: string,
  entry: Entry,
): { runs: Array<Text>; shown: Array<ProjectedRun> } => {
  const runs: Array<Text> = []
  const shown: Array<ProjectedRun> = []
  for (const span of entry.spans) {
    if (span.deleted) continue
    const previous = runs[runs.length - 1]
    if (previous !== undefined && sameMarkSet(previous.marks, span.marks)) {
      runs[runs.length - 1] = { ...previous, text: previous.text + span.text }
      appendChars(
        shown[shown.length - 1]!.chars as Array<CharRange>,
        span.id,
        span.offset,
        span.offset + span.text.length,
      )
      continue
    }
    const id = NodeId.make(charRef(span.id, span.offset))
    runs.push({ type: 'Text', id, text: span.text, marks: span.marks })
    shown.push({
      id,
      chars: [{ id: span.id, from: span.offset, to: span.offset + span.text.length }],
    })
  }
  if (runs.length === 0) {
    const id = emptyRunId(block)
    runs.push({ type: 'Text', id, text: '', marks: [] })
    shown.push({ id, chars: [] })
  }
  return { runs, shown }
}

const projections = new WeakMap<ReplicatedState, Projection>()

const projection = (state: ReplicatedState): Projection => {
  const cached = projections.get(state)
  if (cached !== undefined) return cached
  const runs = new Map<string, ReadonlyArray<ProjectedRun>>()
  const blocks = (ids: ReadonlyArray<string>): Array<Block> =>
    ids.flatMap((id): ReadonlyArray<Block> => {
      const entry = lookup(state, id)
      if (entry === undefined || entry.deleted) return []
      const nodeId = NodeId.make(id)
      const shape = entry.shape
      if (shape.type === 'Unknown') {
        return [
          {
            type: 'Unknown',
            id: nodeId,
            originalType: shape.originalType,
            props: shape.props,
            children: [],
          },
        ]
      }
      if (shape.type === 'Node' && shape.holds !== 'text') {
        return [
          {
            type: 'Node',
            kind: shape.kind,
            id: nodeId,
            props: shape.props,
            children: [],
            ...(shape.holds === 'blocks' ? { blocks: blocks(entry.children) } : {}),
          },
        ]
      }
      const projected = projectRuns(id, entry)
      runs.set(id, projected.shown)
      const children = projected.runs
      if (shape.type === 'Paragraph') return [{ type: 'Paragraph', id: nodeId, children }]
      if (shape.type === 'Heading')
        return [{ type: 'Heading', id: nodeId, level: shape.level, children }]
      return [{ type: 'Node', kind: shape.kind, id: nodeId, props: shape.props, children }]
    })
  const result: Projection = { document: { version: 1, children: blocks(state.root) }, runs }
  projections.set(state, result)
  return result
}

/** The document a state shows: visible blocks and characters, with runs merged by marks. */
export const project = (state: ReplicatedState): Document => projection(state).document

// ---------------------------------------------------------------------------------------
// Starting from a document
// ---------------------------------------------------------------------------------------

const shapeOf = (block: Block): BlockShape => {
  switch (block.type) {
    case 'Paragraph':
      return { type: 'Paragraph' }
    case 'Heading':
      return { type: 'Heading', level: block.level }
    case 'Unknown':
      return { type: 'Unknown', originalType: block.originalType, props: block.props }
    case 'Node':
      return {
        type: 'Node',
        kind: block.kind,
        props: block.props,
        holds: block.blocks !== undefined ? 'blocks' : block.children.length > 0 ? 'text' : 'none',
      }
  }
}

/** The ops that build these blocks, and their text, inside `parent` after `after`. */
const buildOps = (
  blocks: ReadonlyArray<Block>,
  parent: ReplicatedId | null,
  after: ReplicatedId | null,
  mint: () => ReplicatedId,
  named: (block: Block, id: ReplicatedId) => void = () => {},
): Array<ReplicatedOp> => {
  const ops: Array<ReplicatedOp> = []
  let previous = after
  for (const block of blocks) {
    const id = mint()
    named(block, id)
    ops.push({ type: 'InsertBlock', id, shape: shapeOf(block), parent, after: previous })
    let last: CharRef | null = null
    for (const run of block.children) {
      if (run.text.length === 0) continue
      const key = mint()
      ops.push({
        type: 'Insert',
        id: key,
        block: id,
        after: last,
        text: run.text,
        marks: run.marks,
      })
      last = charRef(key, run.text.length - 1)
    }
    if (block.type === 'Node' && block.blocks !== undefined) {
      ops.push(...buildOps(block.blocks, id, null, mint, named))
    }
    previous = id
  }
  return ops
}

/** A minter of fresh ids under one key: `key:0`, `key:1`, and so on. */
const minter = (key: string): (() => ReplicatedId) => {
  const prefix = ReplicatedId.make(`${key}:x`).slice(0, -2)
  let next = 0
  return () => `${prefix}:${next++}` as ReplicatedId
}

/**
 * A state that shows `document`, with every block and character given a new identity
 * under `key`, which must be unique among the keys this state's ops are minted under.
 */
export const fromDocument = (document: Document, key: string): ReplicatedState =>
  applyOps(empty, buildOps(document.children, null, null, minter(key)))

// ---------------------------------------------------------------------------------------
// Translating an edit
// ---------------------------------------------------------------------------------------

/** A caret or selection end held by what it sits after, so it survives others' edits. */
export const AnchoredPosition = Schema.Struct({
  block: ReplicatedId,
  /** The character just before the position, or null at the block's start. */
  after: Schema.NullOr(CharRef),
  affinity: Schema.Literals(['before', 'after']),
})
export type AnchoredPosition = typeof AnchoredPosition.Type

export const AnchoredSelection = Schema.Union([
  Schema.Struct({
    type: Schema.Literal('Range'),
    anchor: AnchoredPosition,
    focus: AnchoredPosition,
  }),
  Schema.Struct({ type: Schema.Literal('Node'), node: ReplicatedId }),
])
export type AnchoredSelection = typeof AnchoredSelection.Type

const charsLength = (chars: ReadonlyArray<CharRange>): number =>
  chars.reduce((total, range) => total + range.to - range.from, 0)

const sliceChars = (
  chars: ReadonlyArray<CharRange>,
  from: number,
  to: number,
): Array<CharRange> => {
  const out: Array<CharRange> = []
  let at = 0
  for (const range of chars) {
    const length = range.to - range.from
    const start = Math.max(from, at)
    const end = Math.min(to, at + length)
    if (start < end) appendChars(out, range.id, range.from + start - at, range.from + end - at)
    at += length
  }
  return out
}

const concatChars = (...lists: ReadonlyArray<ReadonlyArray<CharRange>>): Array<CharRange> => {
  const out: Array<CharRange> = []
  for (const list of lists)
    for (const range of list) appendChars(out, range.id, range.from, range.to)
  return out
}

const charAt = (chars: ReadonlyArray<CharRange>, index: number): CharRef => {
  const [range] = sliceChars(chars, index, index + 1)
  return charRef(range!.id, range!.from)
}

interface ShadowRun {
  id: string
  chars: Array<CharRange>
  marks: ReadonlyArray<RunMark>
}

/**
 * The document an edit is working on, with each run's characters: the translation replays
 * the edit's operations here to learn which characters each one touches. Block ids new to
 * the edit are renamed to minted ones, recorded in `names`.
 */
interface Shadow {
  readonly runs: Map<string, Array<ShadowRun>>
  readonly children: Map<string | null, Array<string>>
  readonly parents: Map<string, string | null>
  readonly names: Map<string, ReplicatedId>
}

const ROOT = null

/** Rebuilds the shadow for `document`, keeping the characters each block held. */
const shadowOf = (
  document: Document,
  chars: ReadonlyMap<string, ReadonlyArray<CharRange>>,
  names: Map<string, ReplicatedId>,
): Shadow => {
  const shadow: Shadow = { runs: new Map(), children: new Map(), parents: new Map(), names }
  const visit = (blocks: ReadonlyArray<Block>, parent: string | null) => {
    shadow.children.set(
      parent,
      blocks.map(block => block.id),
    )
    for (const block of blocks) {
      shadow.parents.set(block.id, parent)
      if (block.type === 'Node' && block.blocks !== undefined) visit(block.blocks, block.id)
      const held = chars.get(block.id) ?? []
      let at = 0
      shadow.runs.set(
        block.id,
        block.children.map(run => {
          const slice = sliceChars(held, at, at + run.text.length)
          at += run.text.length
          return { id: run.id, chars: slice, marks: run.marks }
        }),
      )
    }
  }
  visit(document.children, ROOT)
  return shadow
}

const blockChars = (shadow: Shadow): Map<string, Array<CharRange>> =>
  new Map(
    [...shadow.runs].map(([block, runs]) => [block, concatChars(...runs.map(run => run.chars))]),
  )

/**
 * Restates an edit's transactions as ops against `state`, which the edit ran on the
 * projection of. `key` must be unique to this edit among everything the state has seen: it
 * names the edit's new characters and blocks. Also anchors the edit's resulting selection.
 * Throws if the transactions do not apply to the projection, which is a caller's bug.
 */
export const translate = (
  state: ReplicatedState,
  result: Pick<Extract<TransactionResult, { readonly ok: true }>, 'transactions' | 'state'>,
  key: string,
): { readonly ops: ReadonlyArray<ReplicatedOp>; readonly selection: AnchoredSelection | null } => {
  const mint = minter(key)
  const ops: Array<ReplicatedOp> = []
  const names = new Map<string, ReplicatedId>()
  const start = projection(state)
  let chars = new Map<string, ReadonlyArray<CharRange>>(
    [...start.runs].map(([block, runs]) => [block, concatChars(...runs.map(run => run.chars))]),
  )
  let current: { document: Document; selection: Selection | null } = {
    document: start.document,
    selection: null,
  }
  // Each transaction is replayed on a shadow rebuilt from the document before it: the
  // normalization between transactions merges runs, which only that document shows.
  for (const transaction of result.transactions) {
    const shadow = shadowOf(current.document, chars, names)
    for (const operation of transaction) translateOne(shadow, operation, ops, mint)
    const applied = apply(current, transaction)
    if (!applied.ok) throw new Error(`translate: a transaction was refused (${applied.error})`)
    current = applied.state
    chars = blockChars(shadow)
  }
  return {
    ops,
    selection: anchorIn(shadowOf(current.document, chars, names), result.state.selection),
  }
}

const replicated = (shadow: Shadow, block: string): ReplicatedId =>
  shadow.names.get(block) ?? (block as ReplicatedId)

const locateRun = (shadow: Shadow, run: string) => {
  for (const [block, runs] of shadow.runs) {
    const index = runs.findIndex(candidate => candidate.id === run)
    if (index !== -1) return { block, runs, index, run: runs[index]! }
  }
  throw new Error(`translate: no run ${run}`)
}

/** The character before `offset` in a run, looking back through earlier runs of its block. */
const charBefore = (
  runs: ReadonlyArray<ShadowRun>,
  index: number,
  offset: number,
): CharRef | null => {
  if (offset > 0) return charAt(runs[index]!.chars, offset - 1)
  for (let earlier = index - 1; earlier >= 0; earlier--) {
    const chars = runs[earlier]!.chars
    const length = charsLength(chars)
    if (length > 0) return charAt(chars, length - 1)
  }
  return null
}

const siblingBefore = (
  shadow: Shadow,
  parent: string | null,
  index: number,
): ReplicatedId | null =>
  index === 0 ? null : replicated(shadow, shadow.children.get(parent)![index - 1]!)

const removeFromParent = (shadow: Shadow, block: string): void => {
  const list = shadow.children.get(shadow.parents.get(block) ?? ROOT)!
  list.splice(list.indexOf(block), 1)
}

/** Records a block subtree the edit inserted, with minted names for its blocks. */
const addSubtree = (shadow: Shadow, block: Block, parent: string | null): void => {
  shadow.parents.set(block.id, parent)
  shadow.runs.set(
    block.id,
    block.children.map(run => ({ id: run.id, chars: [], marks: run.marks })),
  )
  if (block.type === 'Node' && block.blocks !== undefined) {
    shadow.children.set(
      block.id,
      block.blocks.map(child => child.id),
    )
    for (const child of block.blocks) addSubtree(shadow, child, block.id)
  }
}

const translateOne = (
  shadow: Shadow,
  operation: Operation,
  ops: Array<ReplicatedOp>,
  mint: () => ReplicatedId,
): void => {
  switch (operation.type) {
    case 'SetSelection':
      return
    case 'InsertText': {
      if (operation.text.length === 0) return
      const { block, runs, index, run } = locateRun(shadow, operation.at.node)
      const id = mint()
      ops.push({
        type: 'Insert',
        id,
        block: replicated(shadow, block),
        after: charBefore(runs, index, operation.at.offset),
        text: operation.text,
        marks: run.marks,
      })
      run.chars = concatChars(
        sliceChars(run.chars, 0, operation.at.offset),
        [{ id, from: 0, to: operation.text.length }],
        sliceChars(run.chars, operation.at.offset, charsLength(run.chars)),
      )
      return
    }
    case 'DeleteText': {
      const { run } = locateRun(shadow, operation.node)
      const removed = sliceChars(run.chars, operation.from, operation.to)
      if (removed.length > 0) ops.push({ type: 'Delete', ranges: removed })
      run.chars = concatChars(
        sliceChars(run.chars, 0, operation.from),
        sliceChars(run.chars, operation.to, charsLength(run.chars)),
      )
      return
    }
    case 'AddMark': {
      const { run } = locateRun(shadow, operation.node)
      if (run.chars.length > 0) ops.push({ type: 'Mark', ranges: run.chars, mark: operation.mark })
      run.marks = [
        ...run.marks.filter(mark => markName(mark) !== markName(operation.mark)),
        operation.mark,
      ]
      return
    }
    case 'RemoveMark': {
      const { run } = locateRun(shadow, operation.node)
      if (!run.marks.some(mark => markName(mark) === operation.mark)) return
      if (run.chars.length > 0)
        ops.push({ type: 'Unmark', ranges: run.chars, name: operation.mark })
      run.marks = run.marks.filter(mark => markName(mark) !== operation.mark)
      return
    }
    case 'SplitRun': {
      if (operation.offset === 0) return
      const { runs, index, run } = locateRun(shadow, operation.node)
      const rest = sliceChars(run.chars, operation.offset, charsLength(run.chars))
      run.chars = sliceChars(run.chars, 0, operation.offset)
      runs.splice(index + 1, 0, { id: operation.textId, chars: rest, marks: run.marks })
      return
    }
    case 'SplitNode': {
      const { block, runs, index, run } = locateRun(shadow, operation.node)
      const into = mint()
      shadow.names.set(operation.blockId, into)
      ops.push({
        type: 'Split',
        block: replicated(shadow, block),
        after: charBefore(runs, index, operation.offset),
        into,
      })
      const moved: Array<ShadowRun> = [
        {
          id: operation.textId,
          chars: sliceChars(run.chars, operation.offset, charsLength(run.chars)),
          marks: run.marks,
        },
        ...runs.slice(index + 1),
      ]
      run.chars = sliceChars(run.chars, 0, operation.offset)
      runs.splice(index + 1)
      shadow.runs.set(operation.blockId, moved)
      const parent = shadow.parents.get(block) ?? ROOT
      const list = shadow.children.get(parent)!
      list.splice(list.indexOf(block) + 1, 0, operation.blockId)
      shadow.parents.set(operation.blockId, parent)
      return
    }
    case 'JoinNode': {
      ops.push({
        type: 'Join',
        into: replicated(shadow, operation.into),
        removed: replicated(shadow, operation.removed),
      })
      shadow.runs.get(operation.into)!.push(...shadow.runs.get(operation.removed)!)
      shadow.runs.delete(operation.removed)
      const nested = shadow.children.get(operation.removed)
      if (nested !== undefined) {
        for (const child of nested) shadow.parents.set(child, operation.into)
        shadow.children.get(operation.into)!.push(...nested)
        shadow.children.delete(operation.removed)
      }
      removeFromParent(shadow, operation.removed)
      return
    }
    case 'MoveNode': {
      const parent = operation.parent ?? ROOT
      removeFromParent(shadow, operation.node)
      ops.push({
        type: 'MoveBlock',
        id: replicated(shadow, operation.node),
        parent: parent === ROOT ? null : replicated(shadow, parent),
        after: siblingBefore(shadow, parent, operation.to),
      })
      shadow.children.get(parent)!.splice(operation.to, 0, operation.node)
      shadow.parents.set(operation.node, parent)
      return
    }
    case 'RetypeBlock':
      ops.push({ type: 'Retype', id: replicated(shadow, operation.node), to: operation.to })
      return
    case 'SetProps':
      ops.push({ type: 'SetProps', id: replicated(shadow, operation.node), props: operation.props })
      return
    case 'InsertNode': {
      const parent = operation.parent ?? ROOT
      const after = siblingBefore(shadow, parent, operation.at)
      const built = buildOps(
        [operation.block],
        parent === ROOT ? null : replicated(shadow, parent),
        after,
        mint,
        (block, id) => shadow.names.set(block.id, id),
      )
      ops.push(...built)
      shadow.children.get(parent)!.splice(operation.at, 0, operation.block.id)
      addSubtree(shadow, operation.block, parent)
      // The inserted runs' characters are the Insert ops just built, in the same order.
      const inserts = built.filter(
        (op): op is Extract<ReplicatedOp, { type: 'Insert' }> => op.type === 'Insert',
      )
      let next = 0
      const fill = (block: Block) => {
        const runs = shadow.runs.get(block.id)!
        for (const [index, run] of block.children.entries()) {
          if (run.text.length === 0) continue
          runs[index]!.chars = [{ id: inserts[next++]!.id, from: 0, to: run.text.length }]
        }
        if (block.type === 'Node' && block.blocks !== undefined) block.blocks.forEach(fill)
      }
      fill(operation.block)
      return
    }
    case 'DeleteNode':
      ops.push({ type: 'DeleteBlock', id: replicated(shadow, operation.node) })
      removeFromParent(shadow, operation.node)
      return
  }
}

const anchorPosition = (shadow: Shadow, position: Position): AnchoredPosition => {
  const { block, runs, index } = locateRun(shadow, position.node)
  return {
    block: replicated(shadow, block),
    after: charBefore(runs, index, position.offset),
    affinity: position.affinity,
  }
}

const anchorIn = (shadow: Shadow, selection: Selection | null): AnchoredSelection | null => {
  if (selection === null) return null
  if (selection.type === 'Node') {
    return shadow.parents.has(selection.node)
      ? { type: 'Node', node: replicated(shadow, selection.node) }
      : null
  }
  return {
    type: 'Range',
    anchor: anchorPosition(shadow, selection.anchor),
    focus: anchorPosition(shadow, selection.focus),
  }
}

/**
 * Anchors a selection on the projection of `state`, so it can be resolved again after
 * other replicas' ops change the text around it.
 */
export const anchor = (
  state: ReplicatedState,
  selection: Selection | null,
): AnchoredSelection | null => {
  const start = projection(state)
  const chars = new Map(
    [...start.runs].map(([block, runs]) => [block, concatChars(...runs.map(run => run.chars))]),
  )
  return anchorIn(shadowOf(start.document, chars, new Map()), selection)
}

// ---------------------------------------------------------------------------------------
// Resolving a selection
// ---------------------------------------------------------------------------------------

const visible = (state: ReplicatedState, block: string): boolean => {
  for (let at: string | null = block; at !== null;) {
    const entry = lookup(state, at)
    if (entry === undefined || entry.deleted) return false
    at = entry.parent
  }
  return true
}

/** Where a position resolves in the projection: after the nearest visible character. */
const resolvePosition = (
  state: ReplicatedState,
  position: AnchoredPosition,
): Position | undefined => {
  const runs = projection(state).runs
  const atStart = (block: string): Position | undefined => {
    const first = runs.get(block)?.[0]
    return first === undefined
      ? undefined
      : { node: first.id, offset: 0, affinity: position.affinity }
  }
  if (position.after === null) {
    const work = draft(state)
    const place = startOf(work, position.block)
    return place === undefined || !visible(state, place.block) ? undefined : atStart(place.block)
  }
  const { id, index } = parseChar(position.after)
  // The block's visible characters in order; the anchor, or the last visible one before it.
  for (const [block, entry] of Object.entries(state.blocks)) {
    const spanIndex = entry.spans.findIndex(
      span => span.id === id && index >= span.offset && index < span.offset + span.text.length,
    )
    if (spanIndex === -1) continue
    const span = entry.spans[spanIndex]!
    let target: { id: string; index: number } | undefined = span.deleted ? undefined : { id, index }
    for (let earlier = spanIndex - 1; target === undefined && earlier >= 0; earlier--) {
      const candidate = entry.spans[earlier]!
      if (!candidate.deleted) {
        target = { id: candidate.id, index: candidate.offset + candidate.text.length - 1 }
      }
    }
    if (target === undefined) return atStart(block)
    let offset = 0
    for (const run of runs.get(block) ?? []) {
      for (const range of run.chars) {
        if (range.id === target.id && target.index >= range.from && target.index < range.to) {
          return {
            node: run.id,
            offset: offset + target.index - range.from + 1,
            affinity: position.affinity,
          }
        }
        offset += range.to - range.from
      }
      offset = 0
    }
  }
  return visible(state, position.block) ? atStart(position.block) : undefined
}

/**
 * The selection an anchored one names in the projection of `state`. A position whose
 * character was deleted moves back to the nearest character still shown; one whose block
 * is gone resolves to nothing, and so does the selection.
 */
export const resolve = (
  state: ReplicatedState,
  selection: AnchoredSelection | null,
): Selection | null => {
  if (selection === null) return null
  if (selection.type === 'Node') {
    return visible(state, selection.node)
      ? { type: 'Node', node: NodeId.make(selection.node) }
      : null
  }
  const anchorAt = resolvePosition(state, selection.anchor)
  const focusAt = resolvePosition(state, selection.focus)
  return anchorAt === undefined || focusAt === undefined
    ? null
    : { type: 'Range', anchor: anchorAt, focus: focusAt }
}
