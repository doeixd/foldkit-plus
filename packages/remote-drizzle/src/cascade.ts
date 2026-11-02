/**
 * The rows a delete takes with it (#343): every row pointing at a removed row
 * through a relation declared `onDelete: 'cascade'`, and so on from those. The
 * writer removes them itself, so the cascade holds on a store without foreign
 * keys, in the transaction (or D1 batch) that deletes the row named.
 *
 * Each Entity's removed ids are one subquery over the rows as they are, seeded
 * by the id deleted, recursive where the Entity cascades into itself (a
 * reply's replies). The rows are removed leaves first, so each subquery still
 * finds the rows it reads through.
 */
import { getTableName, sql, type AnyColumn, type SQL } from 'drizzle-orm'
import { Option } from 'effect'
import type { AnyEntityBinding } from './binding.js'

/**
 * One relation a step's rows are reached through, and whether a row reached
 * through it is held to its own `Delete` rule (`authorizedBy: 'child'`).
 */
interface Edge {
  readonly column: AnyColumn
  readonly judged: boolean
}

/** One Entity a delete removes rows of, and through which relations, from which Entities. */
export interface CascadeStep {
  readonly binding: AnyEntityBinding
  /** Each relation pointing here from another Entity removed, or from the row named. */
  readonly from: ReadonlyArray<Edge & { readonly parent: AnyEntityBinding }>
  /** Each relation pointing here from this Entity itself: followed until it reaches no row. */
  readonly self: ReadonlyArray<Edge>
}

/** The Entities a delete of one row cascades into, leaves first, and how to find each one's rows. */
export interface CascadePlan {
  readonly steps: ReadonlyArray<CascadeStep>
  /** Each step's removed ids, for the row `id` deleted: a subquery of one `id` column. */
  readonly removed: (step: CascadeStep, id: string) => SQL
  /**
   * Those of a step's removed ids reached through a relation that holds them
   * to their own `Delete` rule, though reached through a `parent` one too;
   * none for a step reached only through `authorizedBy: 'parent'`.
   */
  readonly judged: (step: CascadeStep, id: string) => Option.Option<SQL>
}

const fail = (message: string): never => {
  throw new Error(`[foldkit-remote-drizzle] ${message}`)
}

const idOf = (binding: AnyEntityBinding): AnyColumn =>
  binding.columns.id ?? fail(`${binding.name} has no id column`)

/**
 * What deleting a row of `root` removes with it, worked out once: refused for
 * a cascade that comes back through another Entity, whose rows would each be
 * both the parent and the child of the other's.
 */
export const cascadePlan = (root: AnyEntityBinding): CascadePlan => {
  const steps: Array<CascadeStep> = []
  const placed = new Set<AnyEntityBinding>()
  const visiting: Array<AnyEntityBinding> = []
  const incoming = new Map<
    AnyEntityBinding,
    { from: Array<Edge & { parent: AnyEntityBinding }>; self: Array<Edge> }
  >()
  const into = (binding: AnyEntityBinding) => {
    const known = incoming.get(binding) ?? { from: [], self: [] }
    incoming.set(binding, known)
    return known
  }
  const visit = (parent: AnyEntityBinding): void => {
    visiting.push(parent)
    for (const edge of parent.cascades ?? []) {
      const judged = edge.authorizedBy === 'child'
      if (edge.owner === parent) {
        into(parent).self.push({ column: edge.column, judged })
        continue
      }
      if (visiting.includes(edge.owner))
        fail(
          `a delete of ${root.name} cascades through ${edge.relation} back into ${edge.owner.name}, which it came through; a cascade may come back only to the Entity it leaves`,
        )
      into(edge.owner).from.push({ parent, column: edge.column, judged })
      if (!placed.has(edge.owner) && !visiting.includes(edge.owner)) visit(edge.owner)
    }
    visiting.pop()
    if (!placed.has(parent)) {
      placed.add(parent)
      steps.push({ binding: parent, ...into(parent) })
    }
  }
  visit(root)
  // The root's own step removes only what points at it from itself; with none, nothing.
  const ordered = steps.filter(step => step.binding !== root || step.self.length > 0)
  const byBinding = new Map(ordered.map(step => [step.binding, step]))
  /** The rows pointing through `from` at the row deleted, or at one a step removes. */
  const pointing = (from: CascadeStep['from'], id: string): Array<SQL> =>
    from.flatMap(({ parent, column }) => {
      const upstream = byBinding.get(parent)
      // A row of the root is the one deleted, or one its own cascade removes (a reply's).
      if (parent === root)
        return [
          sql`${column} = ${id}`,
          ...(upstream === undefined ? [] : [sql`${column} in (${removed(upstream, id)})`]),
        ]
      return [
        sql`${column} in (${removed(upstream ?? fail(`${parent.name} has no cascade step`), id)})`,
      ]
    })
  const removed = (step: CascadeStep, id: string): SQL => {
    const table = step.binding.table
    const own = idOf(step.binding)
    const seeds = pointing(step.from, id)
    // The root's rows pointing at it from itself are its first, read from the id deleted.
    if (step.binding === root) seeds.push(...step.self.map(({ column }) => sql`${column} = ${id}`))
    const base = sql`select ${own} from ${table} where ${sql.join(seeds, sql` or `)}`
    if (step.self.length === 0) return base
    const found = sql.identifier(`cascade_${getTableName(table)}`)
    const joined = sql.join(
      step.self.map(({ column }) => sql`${column} = ${found}.${sql.identifier('id')}`),
      sql` or `,
    )
    return sql`with recursive ${found}(${sql.identifier('id')}) as (${base} union select ${own} from ${table} join ${found} on ${joined}) select ${sql.identifier('id')} from ${found}`
  }
  const judged = (step: CascadeStep, id: string): Option.Option<SQL> => {
    const seeds = [
      ...pointing(
        step.from.filter(edge => edge.judged),
        id,
      ),
      // A row reached from its own Entity points at the row deleted, or at one removed with it.
      ...step.self
        .filter(edge => edge.judged)
        .flatMap(({ column }) => [
          ...(step.binding === root ? [sql`${column} = ${id}`] : []),
          sql`${column} in (${removed(step, id)})`,
        ]),
    ]
    if (seeds.length === 0) return Option.none()
    return Option.some(
      sql`select ${idOf(step.binding)} from ${step.binding.table} where ${sql.join(seeds, sql` or `)}`,
    )
  }
  return { steps: ordered, removed, judged }
}
