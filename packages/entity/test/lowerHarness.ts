/**
 * Both judges of one predicate over one row, as the differential test of the
 * translation (`src/lower.ts`) compares them: today's `Judge` over the old
 * nodes, and metakit's evaluator (or `Expr.judge`) over the translated nodes
 * and the environment `lowerEnv.ts` builds.
 */
import { Option } from 'effect'
import { Node, Str, Verdict } from 'metakit'
import { evalNode, judgeNode } from 'metakit/build'
import {
  Held,
  Judge,
  Operators,
  QueryEvaluateError,
  type AnyEntity,
  type ExprContext,
  type HeldRow,
  type HeldRows,
  type MemoryOperators,
  type OrderTerm,
  type Predicate,
} from '../src/index.js'
import { envOf } from '../src/environment.js'
import { foreignOf, readingOf, type Reading } from '../src/reading.js'

/** One judge's answer for one predicate over one row: SQL's three values, not held, or refused. */
export type Answer = 'true' | 'false' | 'null' | 'unheld' | 'refused'

/** What a predicate is judged over. */
export interface Over {
  readonly entity: AnyEntity
  readonly row: HeldRow
  readonly next?: HeldRow | undefined
  readonly input?: Readonly<Record<string, unknown>> | undefined
  readonly context?: ExprContext | undefined
  readonly rows?: HeldRows | undefined
  readonly operators?: MemoryOperators | undefined
}

/** A predicate, judged by both, with how each answered. */
interface Compared {
  readonly entity: Answer
  readonly metakit: Answer
}

const refusedOr = (judge: () => Answer): Answer => {
  try {
    return judge()
  } catch (error) {
    if (error instanceof QueryEvaluateError) return 'refused'
    throw error
  }
}

/** Today's judge: `Judge.predicate`, SQL's null its `False` with the witness `'null'`. */
const entityAnswer = (predicate: Predicate, over: Over): Answer =>
  refusedOr(() =>
    Verdict.match<'null', Answer>(Judge.predicate(predicate, over.row, over), {
      True: () => 'true',
      False: ({ witness }) => (Option.isSome(witness) ? 'null' : 'false'),
      Unknown: () => 'unheld',
    }),
  )

/** What metakit's evaluator gave, as an answer. */
const valueAnswer = (value: unknown): Answer => {
  if (Node.isRefusal(value)) return 'refused'
  if (value === null) return 'null'
  if (typeof value !== 'boolean') throw new Error(`a predicate gave ${String(value)}`)
  return value ? 'true' : 'false'
}

const envFor = (lowered: Reading, over: Over) =>
  envOf(lowered, {
    row: over.row,
    owner: over.entity.identity,
    next: over.next,
    input: over.input,
    context: over.context,
    rows: over.rows,
  })

const foreignFor = (lowered: Reading, over: Over) =>
  foreignOf(lowered, over.operators ?? Operators.kernel)

/** Metakit's evaluator over the translation of `predicate`. */
const metakitAnswer = (predicate: Predicate, over: Over): Answer => {
  const lowered = readingOf([predicate])
  return valueAnswer(evalNode(lowered.nodes[0]!, envFor(lowered, over), foreignFor(lowered, over)))
}

/** Both evaluations of one predicate over one row. */
export const compared = (predicate: Predicate, over: Over): Compared => ({
  entity: entityAnswer(predicate, over),
  metakit: metakitAnswer(predicate, over),
})

/** A judgement over what a holder has: known true, known false (SQL's null among it), not known, refused. */
export type Judged = 'true' | 'false' | 'unknown' | 'refused'

export const entityJudged = (predicate: Predicate, over: Over): Judged => {
  const answer = entityAnswer(predicate, over)
  if (answer === 'null') return 'false'
  return answer === 'unheld' ? 'unknown' : answer
}

/** Metakit's `Expr.judge` over the translation, a refusal told apart from not knowing. */
export const metakitJudged = (predicate: Predicate, over: Over): Judged => {
  const lowered = readingOf([predicate])
  return Verdict.match<never, Judged>(
    judgeNode(lowered.nodes[0]!, envFor(lowered, over), foreignFor(lowered, over)),
    {
      True: () => 'true',
      False: () => 'false',
      Unknown: ({ obligation }) =>
        Option.exists(obligation, ({ kind }) => kind === 'refused') ? 'refused' : 'unknown',
    },
  )
}

/** A held row's id. */
export const idOf = (row: HeldRow): string =>
  Held.match(row.field('id'), { onHeld: String, onUnheld: () => '?' })

/** One term's keys of two rows in order, as an order term reads them. */
const byTerm = (term: OrderTerm, left: unknown, right: unknown): number => {
  if (left === null || right === null) {
    if (left === right) return 0
    return (left === null) === (term.nulls === 'first') ? -1 : 1
  }
  const sign =
    typeof left === 'string' && typeof right === 'string'
      ? Str.byCodePoint(left, right)
      : Number(left) - Number(right)
  return term.direction === 'asc' ? sign : -sign
}

/**
 * The ids of the rows every translated predicate holds of, in the order the
 * translated keys give; `refused` where one refuses a row, as `evaluate`
 * refuses the run.
 */
export const metakitQuery = (
  entity: AnyEntity,
  where: ReadonlyArray<Predicate>,
  terms: ReadonlyArray<OrderTerm>,
  rows: ReadonlyArray<HeldRow>,
  over: Omit<Over, 'entity' | 'row'>,
): ReadonlyArray<string> | 'refused' => {
  const lowered = readingOf(where, terms)
  const kept: Array<{ readonly id: string; readonly keys: ReadonlyArray<unknown> }> = []
  for (const row of rows) {
    const env = envFor(lowered, { ...over, entity, row })
    const foreign = foreignFor(lowered, { ...over, entity, row })
    const answers = lowered.nodes.map(node => valueAnswer(evalNode(node, env, foreign)))
    if (answers.includes('refused')) return 'refused'
    if (answers.every(answer => answer === 'true')) {
      kept.push({ id: idOf(row), keys: lowered.keys.map(key => evalNode(key, env, foreign)) })
    }
  }
  return kept
    .sort((left, right) => {
      for (const [index, term] of terms.entries()) {
        const sign = byTerm(term, left.keys[index], right.keys[index])
        if (sign !== 0) return sign
      }
      return 0
    })
    .map(({ id }) => id)
}
