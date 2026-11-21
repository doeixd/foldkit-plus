/**
 * The reference interpreter: a query body run over rows already in memory.
 *
 * `foldkit-remote-drizzle` compiles a body to SQL. This runs the same body
 * directly, which is what makes "source-neutral" a fact rather than a claim —
 * the two are checked against each other over a real database, and a body that
 * means one thing here and another there is a bug in one of them.
 *
 * It is also the interpreter to reach for when there is no database: a test
 * that wants rows, a server assembling a page from values it already holds, or
 * a client judging rows it already has.
 *
 * It builds an environment from the rows it holds and asks metakit's
 * evaluator, through the translation of `lower.ts` (`judgeRun.ts`), so every
 * reader in memory answers alike. **It follows SQL, not JavaScript**: `null =
 * null` is unknown and a row is not matched by it. A refusal (text holding a
 * NUL, arithmetic past the safe integer range) is a failure, never an answer.
 */
import { Match, Option, Schema, SchemaAST } from 'effect'
import type { Collation } from './collation.js'
import type { EntityIdentity } from './index.js'
import { Node, Verdict } from 'metakit'
import { evalNode } from 'metakit/build'
import type { ExprContext } from './context.js'
import { Expr, Query, dependenciesOf } from './expr.js'
import type {
  AnyExpr,
  AnyQuery,
  Operandish,
  Operation,
  OperatorDescriptor,
  Predicate,
} from './expr.js'
import { Held, type HeldRow, type HeldRows } from './held.js'
import { flatRow, loweringOf, noRow, run, type Over, type Row } from './judgeRun.js'
import { callOperator, foreignOf } from './lowerOperator.js'
import { kernelOperators } from './memoryTable.js'
import type { MemoryOperators } from './operators.js'
import { pinsOf, type Pins } from './pins.js'
import {
  ContextMissingError,
  OperatorMissingError,
  QueryEvaluateError,
  RowsMissingError,
  refusedBy,
} from './queryErrors.js'
import { byTerms, checkKeys, checkTerms, keysOf, ordered } from './rowOrder.js'

export type { Row } from './judgeRun.js'
export type { Pins } from './pins.js'
export {
  ContextMissingError,
  OperatorMissingError,
  QueryEvaluateError,
  RowsMissingError,
} from './queryErrors.js'
export { compareRows } from './rowOrder.js'

/** SQL's unknown: neither true nor false, and a row is kept only on true. */
type Truth = boolean | 'unknown'

/** What a predicate comes to: SQL's three values, of which a row is kept only on `true`. */
export type PredicateTruth = Truth

/** A predicate's value as a truth: null is SQL's unknown. */
const truthOf = (value: unknown): Truth => {
  if (value === null) return 'unknown'
  if (typeof value !== 'boolean') {
    throw new QueryEvaluateError(`a predicate gave ${JSON.stringify(value)}, which is not a truth`)
  }
  return value
}

/** A two-valued run's answer: what it could not decide is refused. */
const settled = (held: Held<unknown>): unknown =>
  Held.match(held, {
    onHeld: value => value,
    onUnheld: reason => {
      throw new RowsMissingError(reason)
    },
  })

/** One operand over a plain row, two-valued: its value, refused where it needs another row. */
const valueOver = (key: object, node: Operandish, over: Omit<Over, 'judging'>): unknown =>
  settled(run(loweringOf(key, [node]), { ...over, judging: false })[0]!)

/**
 * What an operand comes to over no row: a call of literals and inputs, run by
 * `operators` (the kernel's when not given), a predicate as its truth with
 * unknown as null. How a conformance check asks an implementation one
 * question; refuses what `evaluate` refuses (an operator the table lacks,
 * text holding NUL).
 */
export const valueOfOperand = (
  node: Operandish,
  options: {
    readonly input?: Row | undefined
    readonly operators?: MemoryOperators | undefined
    readonly context?: ExprContext | undefined
  } = {},
): unknown =>
  valueOver(node, node, {
    row: noRow,
    next: noRow,
    input: options.input ?? {},
    operators: options.operators ?? kernelOperators,
    context: options.context,
  })

/**
 * A primitive operator over stored values, as a call of it is run: what a
 * computed assignment comes to (`Write.apply`). Refused, as a call is, when
 * `operators` does not implement it, and where metakit refuses its values.
 */
export const applyOperator = (
  operator: OperatorDescriptor,
  values: ReadonlyArray<unknown>,
  options: {
    readonly collation: Option.Option<Collation>
    readonly operators: MemoryOperators
  },
): unknown => {
  if (Option.isSome(operator.definedAs) || !options.operators.has(operator)) {
    throw new OperatorMissingError(operator, options.operators)
  }
  const foreign = new Map<string, OperatorDescriptor>()
  const node = callOperator(
    operator,
    values.map(value => Node.Lit({ value: value === undefined ? null : value })),
    options.collation,
    foreign,
  )
  const value = evalNode(
    node,
    {},
    foreignOf(
      { nodes: [], keys: [], related: new Map(), viewers: new Map(), foreign },
      options.operators,
    ),
  )
  if (Node.isRefusal(value)) throw refusedBy(value)
  // A predicate operator's unknown is null, as SQL's.
  return value === null && SchemaAST.isBoolean(Schema.toEncoded(operator.output).ast) ? null : value
}

/** What a predicate reads besides its input, asked once per node: nodes are frozen. */
const readsBeyond = new WeakMap<Predicate, { readonly field: boolean; readonly context: boolean }>()

/**
 * A predicate's truth from the input (and the context, when given) alone,
 * when it reads no field; none when it reads one, or reads the context and
 * none is given. An interpreter that runs per request decides such a
 * predicate before it builds anything: `isNull($status)` is known before any
 * row is. Refuses what `evaluate` refuses (text holding a NUL).
 */
export const decided = (
  node: Predicate,
  input: Row,
  operators: MemoryOperators = kernelOperators,
  context?: ExprContext,
): Option.Option<PredicateTruth> => {
  let reads = readsBeyond.get(node)
  if (reads === undefined) {
    // A field after a write is a field too: nothing in the input alone decides it.
    const read = dependenciesOf(node)
    reads = {
      // So is a path's or an exists' row: each is read from a row.
      field: read.fields.length + read.next.length + read.reaches.length > 0,
      context: read.operations.some(operation => operation === 'viewer' || operation === 'now'),
    }
    readsBeyond.set(node, reads)
  }
  return reads.field || (reads.context && context === undefined)
    ? Option.none()
    : Option.some(
        truthOf(valueOver(node, node, { row: noRow, next: noRow, input, operators, context })),
      )
}

/** A predicate's truth over one row (and, for an invariant, the row after a write): SQL's three values. */
export const truthOver = (
  node: Predicate,
  row: Row,
  input: Row = {},
  next: Row = {},
  operators: MemoryOperators = kernelOperators,
): PredicateTruth =>
  truthOf(valueOver(node, node, { row: flatRow(row), next: flatRow(next), input, operators }))

/**
 * What `Judge.predicate` comes to, as metakit's `Verdict`: `False` where SQL's
 * null leaves a row out (the witness is `'null'`, to tell it from a false one),
 * `Unknown` where the answer rests on something the holder lacks.
 */
export type PredicateVerdict = Verdict.Verdict<'null'>

const verdictOf = (held: Held<unknown>): PredicateVerdict =>
  Held.match(held, {
    onUnheld: (reason): PredicateVerdict => Verdict.Unknown(reason),
    onHeld: value => {
      const truth = truthOf(value)
      if (truth === 'unknown') return Verdict.False(Option.some('null' as const))
      return truth ? Verdict.True() : Verdict.False<'null'>()
    },
  })

/** What a verdict reads over, besides the row judged. */
interface JudgeOptions {
  readonly input?: Row | undefined
  readonly operators?: MemoryOperators | undefined
  /** What `Expr.viewer` and `Expr.now` read; a predicate reading one refuses a run without it. */
  readonly context?: ExprContext | undefined
  /**
   * The holder's rows, where a path from the viewer starts. Without them the
   * viewer's row is not held, and such a path is unknown.
   */
  readonly rows?: HeldRows | undefined
}

/**
 * The reference interpreter over what a holder has (`HeldRow`), three-valued:
 * where an answer rests on a row or field the holder lacks or may not see, or
 * on an operator only the server runs, it is unknown, and is never guessed.
 * Where it is known, it is what SQL answers over the same rows: the law the
 * conformance suite checks.
 */
export const Judge = {
  /** A predicate over one held row, and, for an invariant, the row a write would leave. */
  predicate: (
    predicate: Predicate,
    row: HeldRow,
    options: JudgeOptions & { readonly next?: HeldRow | undefined } = {},
  ): PredicateVerdict =>
    verdictOf(
      run(loweringOf(predicate, [predicate]), {
        row,
        owner: ownerOf(predicate),
        next: options.next ?? noRow,
        input: options.input ?? {},
        operators: options.operators ?? kernelOperators,
        judging: true,
        context: options.context,
        rows: options.rows,
      })[0]!,
    ),

  /**
   * Whether a held row is in a query's result: known when every predicate
   * holds (in) or one fails or is null (out), unknown otherwise. `serverOnly`
   * names a filter the server conjoins that this holder does not run (a Read
   * rule, a source's own `where`): a row the body admits is then unknown, and
   * one it refuses is still out. Refuses, as `evaluate` does, a given value
   * holding a NUL.
   */
  query: (
    body: AnyQuery,
    input: Row,
    row: HeldRow,
    options: Omit<JudgeOptions, 'input'> & { readonly serverOnly?: string | undefined } = {},
  ): Verdict.Verdict<never> => {
    if (givenUnportable(body.where, Query.dependencies(body).inputs, input)) {
      throw new QueryEvaluateError(
        `query "${body.entity.name}" was given text holding a NUL character, or NaN, which no two backends agree on`,
      )
    }
    // Every predicate is asked, as `evaluate` asks them: one may refuse its value.
    const verdicts = run(loweringOf(body, body.where), {
      row,
      owner: body.entity.identity,
      next: noRow,
      input,
      operators: options.operators ?? kernelOperators,
      judging: true,
      context: options.context,
      rows: options.rows,
    }).map(verdictOf)
    if (verdicts.some(Verdict.isFalse)) return Verdict.False()
    const unheld = verdicts.find(Verdict.isUnknown)
    if (unheld !== undefined) return Verdict.Unknown(unheld.reason)
    return options.serverOnly === undefined
      ? Verdict.True()
      : Verdict.Unknown(`the server also filters by ${options.serverOnly}`)
  },

  /**
   * What a conjunction fixes by field: each `eq` of a field and a literal, an
   * input or the viewer, by the field's key, and whether that is all it says
   * (`whole`), so every row holding those values satisfies it. A holder holding
   * every row a `whole` list's body fixes this way holds every row an exists
   * whose filter fixes the same values counts.
   */
  pins: (
    predicates: ReadonlyArray<Predicate>,
    options: { readonly input?: Row | undefined; readonly context?: ExprContext | undefined } = {},
  ): Pins => pinsOf(predicates, options.input ?? {}, options.context),
}

const owners = new WeakMap<Predicate, Option.Option<EntityIdentity<string>>>()

/** The Entity whose row a predicate reads, which a hop through a relation starts from. */
const ownerOf = (predicate: Predicate): EntityIdentity<string> | undefined => {
  let known = owners.get(predicate)
  if (known === undefined) {
    const read = dependenciesOf(predicate)
    const reached = read.reaches.map(each =>
      Match.valueTags(each, {
        Path: ({ via }) => Option.fromUndefinedOr(via[0]?.owner),
        Exists: ({ via, relation }) => Option.some(via[0]?.owner ?? relation.target().identity),
        ViewerPath: () => Option.none<EntityIdentity<string>>(),
      }),
    )
    known = Option.firstSomeOf([Option.fromUndefinedOr(read.fields[0]?.owner), ...reached])
    owners.set(predicate, known)
  }
  return Option.getOrUndefined(known)
}

/** Whether a plain row is in the body's result: every predicate must be true. */
const matches = (
  body: AnyQuery,
  row: Row,
  input: Row,
  scope: Omit<Over, 'row' | 'next' | 'input' | 'judging'>,
) =>
  // Every predicate is asked, as `and` asks every operand: SQL fixes no order, so
  // one that refuses its value refuses whichever comes first in the list.
  run(loweringOf(body, body.where), {
    ...scope,
    row: flatRow(row),
    owner: body.entity.identity,
    next: noRow,
    input,
    judging: false,
  })
    .map(held => truthOf(settled(held)))
    .every(truth => truth === true)

/**
 * The operations this interpreter runs. It is the reference, so this is the
 * whole kernel — but it is declared rather than assumed, because an
 * interpreter that gains an operator and forgets to say so is exactly what
 * `Query.unsupported` exists to catch.
 */
export const supported: ReadonlyArray<Operation> = [
  'eq',
  'isNull',
  'isNotNull',
  'contains',
  'in',
  'and',
  'or',
  'not',
  'compare',
  'viewer',
  'now',
]

/**
 * Refuses a body needing an operation this interpreter does not run, rather
 * than skipping it and answering a different question. Called by `evaluate`;
 * call it directly to check a body once instead of on every run.
 */
export const assertSupported = (
  body: AnyQuery,
  operators: MemoryOperators = kernelOperators,
): void => {
  const missing = Query.unsupported(body, supported, operators)
  if (missing.length > 0) {
    throw new QueryEvaluateError(
      `this interpreter does not run ${missing.join(', ')}, which query "${body.entity.name}" needs`,
    )
  }
}

/**
 * The rows the body matches, in the order it asks for. Pure: it reads the rows
 * it is given and nothing else.
 *
 * `input` holds the values this run was given, by the keys the body's
 * placeholders were built with — the same record the query would be called
 * with anywhere else.
 *
 * The order is part of the answer, so an order over text with no declared
 * collation is refused (`Query.placement`'s reason): declare one on the field,
 * or on the term.
 */
export const evaluate = (
  body: AnyQuery,
  input: Row,
  rows: ReadonlyArray<Row>,
  options: {
    readonly operators?: MemoryOperators | undefined
    /** What `Expr.viewer` and `Expr.now` read; a body reading one refuses a run without it. */
    readonly context?: ExprContext | undefined
  } = {},
): ReadonlyArray<Row> => {
  const operators = options.operators ?? kernelOperators
  const { context } = options
  assertSupported(body, operators)
  return ordered(
    rows.filter(row => matches(body, row, input, { operators, context })),
    Query.orderFor(body, input),
    body.entity.name,
    { input, operators, context },
  )
}

/** What `evaluateEach` made of each row: those it matched, in order, and those it refused. */
export interface Evaluated {
  readonly matched: ReadonlyArray<Row>
  readonly refused: ReadonlyArray<Row>
}

/**
 * As `evaluate`, with each row judged alone: a row whose own values are
 * refused (text holding a NUL, a value an operator fails on) is set aside in
 * `refused` and the others are still answered. A client judging the rows it
 * holds wants this, since one bad stored row says nothing about the rest.
 *
 * What no single row causes still refuses the run: an operation or operator
 * the table lacks, an order by a locale collation, an input the body reads
 * holding a NUL (every row would refuse, and no row is the cause), and order
 * keys of different kinds across rows. It judges membership, which no order
 * decides, so an order over text with no declared collation does not refuse it:
 * `matched` is then in code point order, which no other reader need follow.
 */
export const evaluateEach = (
  body: AnyQuery,
  input: Row,
  rows: ReadonlyArray<Row>,
  options: {
    readonly operators?: MemoryOperators | undefined
    /** As `evaluate`'s. */
    readonly context?: ExprContext | undefined
  } = {},
): Evaluated => {
  const operators = options.operators ?? kernelOperators
  const { context } = options
  assertSupported(body, operators)
  const terms = Query.orderFor(body, input)
  checkTerms(terms, body.entity.name)
  const read = [...body.where, ...terms.map(term => term.expr)]
  const scope = { input, operators, context }
  const keyed: Array<{ readonly row: Row; readonly keys: ReadonlyArray<unknown> }> = []
  const refused: Row[] = []
  for (const row of rows) {
    try {
      if (matches(body, row, input, { operators, context }))
        keyed.push({ row, keys: keysOf(row, terms, scope) })
    } catch (error) {
      if (
        !(error instanceof QueryEvaluateError) ||
        error instanceof ContextMissingError ||
        // An alternative of `Order.chosen` this input did not choose reads nothing.
        givenUnportable(read, dependenciesOf(...read).inputs, input)
      )
        throw error
      refused.push(row)
    }
  }
  checkKeys(
    keyed.map(({ keys }) => keys),
    terms,
    body.entity.name,
  )
  return {
    matched: keyed
      .sort((left, right) => byTerms(terms, left.keys, right.keys))
      .map(({ row }) => row),
    refused,
  }
}

const NUL = String.fromCharCode(0)

/**
 * Whether a constant of `read`, or a value of `input` that `inputs` name, is
 * one no two backends agree on (text holding a NUL, NaN), or a list holding
 * one: every row would refuse.
 */
const givenUnportable = (
  read: ReadonlyArray<AnyExpr | Predicate>,
  inputs: ReadonlyArray<string>,
  input: Row,
): boolean =>
  Expr.givesUnportable(...read) ||
  inputs.some(key => {
    const value = input[key]
    const unportable = (each: unknown) =>
      (typeof each === 'string' && each.includes(NUL)) ||
      (typeof each === 'number' && Number.isNaN(each))
    return Array.isArray(value) ? value.some(unportable) : unportable(value)
  })
