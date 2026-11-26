/**
 * Query coverage (Phase 4 Part B, Bout 4.14): whether a held query's rows
 * already contain every row an asked query would return (`asked.where ⇒ held.where`),
 * checked synchronously by `metakit`'s Tier 3 `Abstract.checkGoal`.
 *
 * Unknown means the client cannot prove coverage and must ask the server.
 */
import { Option, Schema } from 'effect'
import type { AnyQuery } from 'foldkit-entity'
import { Abstract, Bool, type Expr, Node, Transition, Verdict } from 'metakit'
import { wrap } from 'metakit/build'

const readInputPath = (
  input: Readonly<Record<string, unknown>>,
  path: ReadonlyArray<string>,
): Option.Option<unknown> => {
  let cursor: unknown = input
  for (const segment of path) {
    if (cursor === null || typeof cursor !== 'object' || !Object.hasOwn(cursor, segment)) {
      return Option.none()
    }
    cursor = (cursor as Readonly<Record<string, unknown>>)[segment]
  }
  return Option.some(cursor === undefined ? null : cursor)
}

const rowToState = (
  node: Node.Node,
  inputNamespace: 'heldInput' | 'askedInput',
  input?: Readonly<Record<string, unknown>>,
): Node.Node =>
  Node.substitutePaths(node, segments => {
    if (segments[0] === 'row') {
      return Option.some(
        Node.Path({ segments: ['state', ...segments.slice(1)], ast: Option.none() }),
      )
    }
    if (segments[0] === 'input' && segments.length >= 2) {
      if (input !== undefined) {
        const bound = readInputPath(input, segments.slice(1))
        if (Option.isSome(bound)) {
          return Option.some(Node.Lit({ value: bound.value as Node.Lit['value'] }))
        }
      }
      // Keep unbound input parameters in distinct namespaces so held.input.x
      // and asked.input.x never alias each other when left unbound.
      return Option.some(
        Node.Path({ segments: [inputNamespace, ...segments.slice(1)], ast: Option.none() }),
      )
    }
    return Option.none()
  })

const conjoinNodes = (nodes: ReadonlyArray<Node.Node>): Expr.Expr<any, boolean | null> => {
  if (nodes.length === 0) return wrap<any, boolean | null>(Node.Lit({ value: true }))
  let acc: Expr.Expr<any, boolean | null> = wrap<any, boolean | null>(nodes[0]!)
  for (let i = 1; i < nodes.length; i++) {
    acc = Bool.and(acc, wrap<any, boolean | null>(nodes[i]!))
  }
  return acc
}

export interface CoverageOptions {
  readonly heldInput?: Readonly<Record<string, unknown>> | undefined
  readonly askedInput?: Readonly<Record<string, unknown>> | undefined
  readonly foreign?: Expr.ReaderOptions['foreign'] | undefined
}

/**
 * Whether every row matching `asked` is guaranteed to be included in `held`
 * (`asked.where ⇒ held.where`), checked over `entity.schema` via `Abstract.checkGoal`.
 *
 * - Different entities -> `Verdict.False()`.
 * - `held` has no `where` predicates -> `Verdict.True()` (holds all rows of that entity).
 * - Otherwise proves `asked.where ⇒ held.where`: `True` means covered, `False`
 *   means disjoint/contradictory, `Unknown` means ask the server.
 */
export const covers = (
  held: AnyQuery,
  asked: AnyQuery,
  options?: CoverageOptions,
): Verdict.Verdict<never> => {
  if (held.entity.name !== asked.entity.name) {
    return Verdict.False()
  }
  if (held.where.length === 0) {
    return Verdict.True()
  }

  const heldNodes = held.where.map(p => rowToState(p.node, 'heldInput', options?.heldInput))
  const askedNodes = asked.where.map(p => rowToState(p.node, 'askedInput', options?.askedInput))

  const heldExpr = conjoinNodes(heldNodes)
  const askedExpr = conjoinNodes(askedNodes)

  const stateSchema = held.entity.schema
  const noop = Transition.make({
    state: stateSchema,
    input: Schema.Struct({}),
    when: () => askedExpr,
    apply: () => [],
  })

  return Abstract.checkGoal(stateSchema, noop, {
    goal: heldExpr,
    ...(options?.foreign === undefined ? {} : { foreign: options.foreign }),
  })
}
