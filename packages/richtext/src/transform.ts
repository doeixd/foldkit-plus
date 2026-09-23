import { NodeId, type Block, type Document, type Text } from './document.js'
import { sameMarkSet } from './marks.js'
import type { CollapseStep, PositionStep, RelocateStep, SplitStep } from './transaction.js'

/**
 * Transforms normalize or derive semantic structure after edits (§23). A
 * transform is a pure function of the document plus what the transaction
 * touched: it returns a whole new document and the position steps and identity
 * bookkeeping that go with it, so `apply` can fold it into the same ChangeSet
 * and position map it was already building.
 *
 * Two rules make a registry safe to run in a loop (§24): a transform must be
 * deterministic, and it must be idempotent on normalized state — so running it
 * again after it has run changes nothing, which is how the loop knows it has
 * settled.
 */
export interface TransformContext {
  /** Blocks the transaction touched, plus whatever earlier transforms touched. */
  readonly dirtyNodes: ReadonlySet<NodeId>
  /** Runs already spent, so a transform can bail out rather than spin. */
  readonly pass: number
}

export interface TransformReport {
  readonly document: Document
  /** The same step vocabulary a transaction uses, so `apply` can fold either. */
  readonly steps: ReadonlyArray<PositionStep | SplitStep | RelocateStep | CollapseStep>
  readonly insertedNodes: ReadonlySet<NodeId>
  readonly removedNodes: ReadonlySet<NodeId>
  readonly dirtyNodes: ReadonlySet<NodeId>
  /** Runs whose text a transform rewrote, such as a merge's accumulator. */
  readonly textChanged: ReadonlySet<NodeId>
  /** Whether the block list changed shape, not just the runs inside a block. */
  readonly structureChanged: boolean
}

export interface Transform {
  readonly name: string
  readonly apply: (document: Document, context: TransformContext) => TransformReport
}

/** A transform that found nothing to do. */
export const unchanged = (document: Document): TransformReport => ({
  document,
  steps: [],
  insertedNodes: new Set(),
  removedNodes: new Set(),
  dirtyNodes: new Set(),
  textChanged: new Set(),
  structureChanged: false,
})

const mergeRunInto = (accumulator: Text, run: Text): Text => ({
  ...accumulator,
  text: accumulator.text + run.text,
})

/**
 * Merges adjacent runs whose mark sets match, within the blocks the transaction
 * touched. Merging strictly reduces the run count, so one pass reaches a stable
 * state and a second pass finds nothing: the rule is idempotent, and only equal
 * mark sets merge, so an unknown mark never drops.
 */
export const mergeAdjacentRuns: Transform = {
  name: 'mergeAdjacentRuns',
  apply: (document, context) => {
    const steps: Array<RelocateStep> = []
    const removedNodes = new Set<NodeId>()
    const dirtyNodes = new Set<NodeId>()
    const textChanged = new Set<NodeId>()
    let next: Document = document
    for (const blockId of context.dirtyNodes) {
      const blockIndex = next.children.findIndex(block => block.id === blockId)
      if (blockIndex < 0) continue
      const block = next.children[blockIndex]!
      const first = block.children[0]
      if (first === undefined) continue
      let accumulator = first
      let changed = false
      const kept: Array<Text> = [accumulator]
      for (const run of block.children.slice(1)) {
        if (sameMarkSet(accumulator.marks, run.marks)) {
          steps.push({
            node: run.id,
            into: accumulator.id,
            at: 0,
            base: accumulator.text.length,
          })
          accumulator = mergeRunInto(accumulator, run)
          kept[kept.length - 1] = accumulator
          removedNodes.add(run.id)
          dirtyNodes.add(accumulator.id)
          textChanged.add(accumulator.id)
          changed = true
        } else {
          accumulator = run
          kept.push(run)
        }
      }
      if (!changed) continue
      const blocks: Array<Block> = [...next.children]
      blocks[blockIndex] = { ...block, children: kept }
      next = { ...next, children: blocks }
    }
    return {
      document: next,
      steps,
      insertedNodes: new Set(),
      removedNodes,
      dirtyNodes,
      textChanged,
      structureChanged: false,
    }
  },
}

/** The transforms every transaction runs, in order, unless a caller says otherwise. */
export const defaultTransforms: ReadonlyArray<Transform> = [mergeAdjacentRuns]
