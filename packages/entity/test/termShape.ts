import { Node } from 'metakit'
import type { Ordering } from '../src/index.js'

/**
 * An ordering as plain data, its expressions as their metakit keys: two
 * orderings built apart are equal exactly when their shapes are, which
 * `toEqual` cannot say of the nodes inside them.
 */
export const shapeOf = (ordering: Ordering) =>
  ordering._tag === 'Term'
    ? { ...ordering, expr: Node.key(ordering.expr.node) }
    : {
        ...ordering,
        sort: Node.key(ordering.sort.node),
        choices: Object.fromEntries(
          Object.entries(ordering.choices).map(([name, expr]) => [name, Node.key(expr.node)]),
        ),
      }

export const shapesOf = (orderings: ReadonlyArray<Ordering>) => orderings.map(shapeOf)
