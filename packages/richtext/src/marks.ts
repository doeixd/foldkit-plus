import { Mark, type Document, type Position } from './document.js'

/** Which edges a mark continues across when typing at a run boundary. */
export type MarkExpansion = 'before' | 'after' | 'both' | 'none'

/**
 * A mark definition: its name, and where it continues across a boundary. A Kit
 * declares the vocabulary an editor accepts, so an application can say that its
 * own mark behaves like a link (nothing expands) or like bold (it continues).
 */
export interface MarkDef {
  readonly name: string
  readonly expand: MarkExpansion
}

/** Declares a mark, defaulting to `both`: the conservative choice for an unknown name. */
export const mark = (name: string, expand: MarkExpansion = 'both'): MarkDef => {
  if (name.length === 0) throw new Error('RichText.mark: a mark needs a name')
  return { name, expand }
}

export const Bold: MarkDef = mark('Bold', 'after')
export const Italic: MarkDef = mark('Italic', 'after')
export const Code: MarkDef = mark('Code', 'none')

/** The marks this vocabulary defines, and the policy a document without a Kit gets. */
export const shippedMarks: ReadonlyArray<MarkDef> = [Bold, Italic, Code]

/**
 * The expansion policy of a set of definitions. A mark the registry does not
 * declare expands both ways: preservation never retargets it away.
 */
export interface MarkRegistry {
  readonly expansionOf: (name: string) => MarkExpansion
}

export const markRegistry = (definitions: ReadonlyArray<MarkDef>): MarkRegistry => {
  const byName = new Map(definitions.map(definition => [definition.name, definition.expand]))
  return { expansionOf: name => byName.get(name) ?? 'both' }
}

/** The policy of the shipped vocabulary. */
export const shippedRegistry: MarkRegistry = markRegistry(shippedMarks)

/** Whether this vocabulary defines the mark; unknown marks load but never add. */
export const isKnownMark = (mark: string): mark is Mark =>
  shippedMarks.some(definition => definition.name === mark)

/** Order-insensitive mark-set equality; the equivalence normalization merges on. */
export const sameMarkSet = (left: ReadonlyArray<string>, right: ReadonlyArray<string>): boolean =>
  left.length === right.length && left.every(mark => right.includes(mark))

/**
 * Retargets a boundary insertion to the neighboring run when the current run
 * carries marks that forbid the edge and the neighbor carries exactly the
 * marks that remain. Interior positions, missing neighbors, and mismatched
 * neighbors return the input reference unchanged; unknown node ids are left
 * for `apply` to diagnose. Never invents runs: mixed-mark edges stay put.
 */
export const resolveInsertion = (
  document: Document,
  position: Position,
  registry: MarkRegistry = shippedRegistry,
): Position => {
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
    const desired = run.marks.filter(mark => {
      const expand = registry.expansionOf(mark)
      return expand === 'both' || expand === direction
    })
    if (!sameMarkSet(desired, neighbor.marks)) return position
    return {
      node: neighbor.id,
      offset: leavingLeft ? neighbor.text.length : 0,
      affinity: position.affinity,
    }
  }
  return position
}
