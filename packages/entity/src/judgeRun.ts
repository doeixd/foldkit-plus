/**
 * How every judge in memory runs an expression: it is translated to metakit
 * nodes (`lower.ts`) once per declaration, an environment is built from the
 * rows the judge holds (`lowerEnv.ts`), and metakit's three-valued judgement
 * answers (`settleNode`). A value is SQL's (null among them); what rests on
 * something the holder lacks is unheld; a refusal is thrown as a
 * `QueryEvaluateError` carrying it.
 */
import { Option } from 'effect'
import { Node, Verdict } from 'metakit'
import { Settled, settleNode, type ForeignImplementations } from 'metakit/build'
import { now, viewer, type ExprContext } from './context.js'
import { dependenciesOf, type OneRelation, type Operandish } from './expr.js'
import { Held, type HeldRow, type HeldRows } from './held.js'
import type { EntityIdentity } from './index.js'
import { lower, type Lowered } from './lower.js'
import { envOf } from './lowerEnv.js'
import { foreignOf } from './lowerOperator.js'
import type { MemoryOperators } from './operators.js'
import {
  ContextMissingError,
  OperatorMissingError,
  QueryEvaluateError,
  refusedBy,
} from './queryErrors.js'
import { own } from './record.js'

/** A row as a run reads one: values by field key, encoded. */
export type Row = Readonly<Record<string, unknown>>

/** Nodes translated, with whether they read the time: what a run needs of its context. */
interface Lowering {
  readonly lowered: Lowered
  readonly readsNow: boolean
}

const lowerings = new WeakMap<object, Lowering>()

/**
 * `nodes` translated, once per `key` (a declaration, frozen). What no reader
 * in memory can hold (a backend's locale collation, two relations of one
 * name) refuses the run.
 */
export const loweringOf = (key: object, nodes: ReadonlyArray<Operandish>): Lowering => {
  const known = lowerings.get(key)
  if (known !== undefined) return known
  let lowered: Lowered
  try {
    lowered = lower(nodes)
  } catch (error) {
    throw new QueryEvaluateError(error instanceof Error ? error.message : String(error))
  }
  const made = {
    lowered,
    readsNow: dependenciesOf(...nodes).operations.includes('now'),
  }
  lowerings.set(key, made)
  return made
}

/** What a run reads its nodes over. */
export interface Over {
  readonly row: HeldRow
  /** The Entity `row` is a row of; without it no relation is followed. */
  readonly owner?: EntityIdentity<string> | undefined
  readonly next: HeldRow
  readonly input: Row
  readonly operators: MemoryOperators
  /**
   * Whether this is `Judge`, for which an operator the table lacks is one more
   * thing it does not know; elsewhere it refuses the run.
   */
  readonly judging: boolean
  readonly context?: ExprContext | undefined
  readonly rows?: HeldRows | undefined
}

/**
 * One plain row, all a two-valued run is given: a key it lacks is null, as
 * SQL binds a missing value, and no other row can be reached from it.
 */
export const flatRow = (row: Row): HeldRow => ({
  field: key => Held.of(own(row, key) ?? null),
  follow: (relation: OneRelation) =>
    Held.unheld(`${relation.owner.name}.${relation.key} leads to another row`),
  pointing: relation => ({
    rows: [],
    missing: Option.some(`${relation.owner.name}.${relation.key} is read from other rows`),
  }),
})

/** A run that is given no row: whatever it reads of one is null. */
export const noRow: HeldRow = flatRow({})

/** Refuses a run that reads the viewer or the time where its context cannot say them. */
const checkContext = ({ lowered, readsNow }: Lowering, context: ExprContext | undefined) => {
  const [read] = lowered.viewers.values()
  const term = read === undefined ? (readsNow ? now : undefined) : viewer(read)
  if (term === undefined) return
  if (context === undefined) {
    throw new ContextMissingError(term, 'was given no context to read it from')
  }
  if (readsNow && Option.isNone(context.now)) {
    throw new ContextMissingError(now, 'its context has no reading of the time')
  }
}

const reasonOf = (verdict: Verdict.Verdict<never>): string =>
  Verdict.match(verdict, {
    True: () => 'it holds',
    False: () => 'it does not hold',
    Unknown: ({ reason }) => reason,
  })

type Reads = Option.Option<ReadonlyArray<ReadonlyArray<string>>>

/**
 * Each node of `lowering` over one row: its value, or why the holder cannot
 * say. A refusal is thrown, carried by a `QueryEvaluateError`.
 */
export const run = (lowering: Lowering, over: Over): ReadonlyArray<Held<unknown>> => {
  checkContext(lowering, over.context)
  const { lowered } = lowering
  if (!over.judging) {
    for (const operator of lowered.foreign.values()) {
      if (!over.operators.has(operator)) throw new OperatorMissingError(operator, over.operators)
    }
  }
  const left: Array<readonly [ReadonlyArray<string>, string]> = []
  const env = envOf(lowered, {
    row: over.row,
    owner: over.owner,
    next: over.next,
    input: over.input,
    context: over.context,
    rows: over.rows,
    unheld: (segments, reason) => left.push([segments, reason]),
  })
  const foreign: ForeignImplementations = foreignOf(lowered, over.operators)
  // The holder's own word for a value what is left still reads, else metakit's.
  const reasonFor = (reads: Reads, verdict: Verdict.Verdict<never>): string =>
    Option.getOrElse(
      Option.flatMap(reads, paths =>
        Option.fromUndefinedOr(
          left.find(([segments]) =>
            paths.some(read => segments.every((segment, at) => read[at] === segment)),
          )?.[1],
        ),
      ),
      () => reasonOf(verdict),
    )
  return lowered.nodes.map(node =>
    Settled.$match(settleNode(node, env, foreign), {
      Known: ({ value }) => {
        if (Node.isRefusal(value)) throw refusedBy(value)
        return Held.of(value)
      },
      Open: ({ reads, verdict }) => Held.unheld(reasonFor(reads, verdict)),
    }),
  )
}
