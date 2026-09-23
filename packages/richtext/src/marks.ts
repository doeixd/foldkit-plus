import { Mark, type Document, type Position } from './document.js'

/** Which edges a mark continues across when typing at a run boundary. */
export type MarkExpansion = 'before' | 'after' | 'both' | 'none'

/** Fixed-vocabulary mark definition. Kit definitions generalize this later. */
export interface MarkDef {
  readonly name: Mark
  readonly expand: MarkExpansion
}

export const Bold: MarkDef = { name: 'Bold', expand: 'after' }
export const Italic: MarkDef = { name: 'Italic', expand: 'after' }
export const Code: MarkDef = { name: 'Code', expand: 'none' }

const definitions: Record<Mark, MarkDef> = { Bold, Italic, Code }

/** Whether this vocabulary defines the mark; unknown marks load but never add. */
export const isKnownMark = (mark: string): mark is Mark => mark in definitions

/** Order-insensitive mark-set equality; the equivalence normalization merges on. */
export const sameMarkSet = (left: ReadonlyArray<string>, right: ReadonlyArray<string>): boolean =>
  left.length === right.length && left.every(mark => right.includes(mark))

const expands = (mark: string, direction: 'before' | 'after'): boolean => {
  const known = (definitions as Record<string, MarkDef | undefined>)[mark]
  const expand = known?.expand ?? 'both'
  return expand === 'both' || expand === direction
}

/**
 * Retargets a boundary insertion to the neighboring run when the current run
 * carries marks that forbid the edge and the neighbor carries exactly the
 * marks that remain. Interior positions, missing neighbors, and mismatched
 * neighbors return the input reference unchanged; unknown node ids are left
 * for `apply` to diagnose. Never invents runs: mixed-mark edges stay put.
 */
export const resolveInsertion = (document: Document, position: Position): Position => {
  for (const block of document.children) {
    const index = block.children.findIndex(run => run.id === position.node)
    const run = block.children[index]
    if (run === undefined) continue
    const leavingLeft = position.affinity === 'before' && position.offset === 0
    const leavingRight = position.affinity === 'after' && position.offset === run.text.length
    if (!leavingLeft && !leavingRight) return position
    const neighbor = leavingLeft ? block.children[index - 1] : block.children[index + 1]
    if (neighbor === undefined) return position
    const direction = leavingLeft ? 'before' : 'after'
    const desired = run.marks.filter(mark => expands(mark, direction))
    if (!sameMarkSet(desired, neighbor.marks)) return position
    return {
      node: neighbor.id,
      offset: leavingLeft ? neighbor.text.length : 0,
      affinity: position.affinity,
    }
  }
  return position
}
