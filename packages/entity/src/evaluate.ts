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
 * It lives in `foldkit-entity` because it is the **reference semantics** of the
 * IR this package owns — what §6.0.1 means operationally rather than in prose —
 * and a specification's reference implementation belongs with the
 * specification. The rule that keeps it here: **it may depend on the IR and
 * nothing else.** The moment it wants a Remote concept it has moved to the
 * wrong place and should leave.
 *
 * **It follows SQL, not JavaScript.** Where the two disagree this follows SQL,
 * because SQL is what the other interpreter runs. The important case is null:
 * `null = null` is unknown in SQL and a row is not matched by it, where
 * JavaScript would happily call the two equal.
 */
import { Match, Option, Schema, SchemaAST } from 'effect'
import { absurd } from 'effect/Function'
import { Collation } from './collation.js'
import { Expr, Query, dependenciesOf, isPredicate, missingName, noOperators } from './expr.js'
import type {
  AnyExpr,
  AnyQuery,
  CallExpr,
  ExistsPredicate,
  OneRelation,
  Operandish,
  Operation,
  OperatorDescriptor,
  OperatorTable,
  OrderTerm,
  Predicate,
  TestPredicate,
} from './expr.js'
import { Held, type HeldRow } from './held.js'
import { Operators, type MemoryImplementation, type MemoryOperators } from './operators.js'
import { contextValue, type ExprContext, type NowExpr, type ViewerExpr } from './context.js'

/** A row as this interpreter reads one: values by field key. */
export type Row = Readonly<Record<string, unknown>>

export class QueryEvaluateError extends Error {
  constructor(message: string) {
    super(`[foldkit-entity] ${message}`)
    this.name = 'QueryEvaluateError'
  }
}

/**
 * A call of a primitive operator the table does not implement. Its own class,
 * because a form judging an invariant reads it as a judgement it cannot make
 * (`Undecided`), not as a failure.
 */
export class OperatorMissingError extends QueryEvaluateError {
  readonly operator: OperatorDescriptor
  /** The operator by its id, and its version past the first. */
  readonly named: string
  /** `operators`, the table that lacks it, names the versions of it that it does hold. */
  constructor(operator: OperatorDescriptor, operators: OperatorTable = noOperators) {
    super(`this interpreter does not run the operator "${missingName(operator, operators)}"`)
    this.name = 'OperatorMissingError'
    this.operator = operator
    this.named = operatorName(operator)
  }
}

/** An operator by its id, and its version when that is not the first. */
const operatorName = (operator: OperatorDescriptor): string =>
  operator.version === 1 ? operator.id : `${operator.id}@${operator.version}`

/**
 * What a predicate is judged over: the row, the input it was given, and the row
 * a write would leave, which an invariant reads (`Next`).
 */
interface Scope {
  readonly row: View
  readonly input: Row
  readonly next: View
  /** How a primitive operator is run. */
  readonly operators: MemoryOperators
  /**
   * Whether this is `Judge`, for which an operator the table lacks is one more
   * thing it does not know; elsewhere it refuses the run.
   */
  readonly judging: boolean
  /** What `Expr.viewer` and `Expr.now` read; a run given none refuses them. */
  readonly context?: ExprContext | undefined
}

/**
 * A run that reads `Expr.viewer` or `Expr.now` and was given no context. No
 * row causes it, so `evaluateEach` refuses the run rather than each row.
 */
export class ContextMissingError extends QueryEvaluateError {
  constructor(term: ViewerExpr<unknown> | NowExpr<unknown>, why: string) {
    super(`this run reads ${Expr.show(term)}, but ${why}`)
    this.name = 'ContextMissingError'
  }
}

const contextOf = (node: ViewerExpr<unknown> | NowExpr<unknown>, scope: Scope): unknown => {
  if (scope.context === undefined) {
    throw new ContextMissingError(node, 'was given no context to read it from')
  }
  return Option.getOrThrowWith(
    contextValue(node, scope.context),
    () => new ContextMissingError(node, 'its context has no reading of the time'),
  )
}

/**
 * What the interpreter does not know: a value, or a truth, that rests on
 * something the holder does not have. Never a value a row holds, which is
 * what lets one sit among values. SQL has no such thing; its unknown is null.
 */
class Unheld {
  constructor(readonly reason: string) {}
}

const isUnheld = (value: unknown): value is Unheld => value instanceof Unheld

/** A truth, or that it rests on something not held: what `holds` comes to. */
type Judged = Truth | Unheld

/** A row as the interpreter reads it, whoever holds it: values may be `Unheld`. */
interface View {
  readonly field: (key: string) => unknown
  /** The row a `one` relation points at; null for none. */
  readonly follow: (relation: OneRelation) => View | null | Unheld
  readonly pointing: (relation: OneRelation) => {
    readonly rows: ReadonlyArray<View>
    readonly missing: Option.Option<string>
  }
}

/**
 * One plain row, all a two-valued run is given: a key it lacks is null, as
 * SQL binds a missing value, and no other row can be reached from it.
 */
const flat = (row: Row): View => ({
  field: key => row[key],
  follow: relation => new Unheld(`${relation.owner.name}.${relation.key} leads to another row`),
  pointing: relation => ({
    rows: [],
    missing: Option.some(`${relation.owner.name}.${relation.key} is read from other rows`),
  }),
})

/** A holder's row as the interpreter reads it. */
const viewOf = (row: HeldRow): View => ({
  field: key =>
    Held.match(row.field(key), { onHeld: value => value, onUnheld: reason => new Unheld(reason) }),
  follow: relation =>
    Held.match<Option.Option<HeldRow>, View | null | Unheld>(row.follow(relation), {
      onHeld: target => Option.match(target, { onNone: () => null, onSome: viewOf }),
      onUnheld: reason => new Unheld(reason),
    }),
  pointing: relation => {
    const { rows, missing } = row.pointing(relation)
    return { rows: rows.map(viewOf), missing }
  },
})

/** A run that is given no row: whatever it reads of one, it lacks. */
const noRow: View = flat({})

/**
 * The row `via` reaches from `from`: null when a link is null or reaches a row
 * the holder knows is not there.
 */
const reached = (from: View, via: ReadonlyArray<OneRelation>): View | null | Unheld => {
  let at: View | null | Unheld = from
  for (const relation of via) {
    if (at === null || isUnheld(at)) return at
    at = at.follow(relation)
  }
  return at
}

/**
 * Whether some row pointing at the one `via` reaches holds the filter: true
 * as soon as a held one does, false only when every one is held and none
 * does. SQL's exists is never null; reached through a path that reaches no
 * row, it is, as the path's field would be.
 */
const exists = (node: ExistsPredicate, scope: Scope): Judged => {
  const anchor = reached(scope.row, node.via)
  if (anchor === null) return 'unknown'
  if (isUnheld(anchor)) return anchor
  const { rows, missing } = anchor.pointing(node.relation)
  let unheld = Option.map(missing, reason => new Unheld(reason))
  for (const row of rows) {
    const truth = Option.match(node.where, {
      onNone: (): Judged => true,
      onSome: where => holds(where, { ...scope, row, next: noRow }),
    })
    if (truth === true) return true
    if (isUnheld(truth)) unheld = Option.orElse(unheld, () => Option.some(truth))
  }
  return Option.getOrElse(unheld, (): Judged => false)
}

const valueOf = (node: AnyExpr, scope: Scope): unknown => {
  switch (node._tag) {
    case 'Field':
      return scope.row.field(node.key)
    case 'Next':
      return scope.next.field(node.field.key)
    case 'Literal':
      return node.value
    case 'Input':
      return scope.input[node.key]
    case 'Call':
      return called(node, scope)
    case 'Viewer':
    case 'Now':
      return contextOf(node, scope)
    case 'Path': {
      const row = reached(scope.row, node.via)
      return row === null || isUnheld(row) ? row : row.field(node.field.key)
    }
    default:
      return absurd(node)
  }
}

/**
 * What a run given one row could not decide without another: a path's or an
 * exists' row. It refuses rather than read the others as absent, which would
 * drop a row from a list on no evidence. `Judge` reads them from a holder.
 */
export class RowsMissingError extends QueryEvaluateError {
  constructor(reason: string) {
    super(`${reason}, which a run over one row cannot read; judge it with \`Judge\``)
    this.name = 'RowsMissingError'
  }
}

/** A two-valued run's answer: what it could not decide is refused. */
const settled = (judged: Judged): Truth => {
  if (isUnheld(judged)) throw new RowsMissingError(judged.reason)
  return judged
}

/**
 * What a call comes to, as a value (a predicate's truth as SQL's, unknown as
 * null). A defined operator's is what it means, as SQL compiles it; a
 * primitive one's is the table's implementation, or it is refused by name.
 */
const called = (call: CallExpr<unknown> | TestPredicate, scope: Scope): unknown => {
  const expansion: Option.Option<AnyExpr | Predicate> = call.expansion
  return Option.match(expansion, {
    onSome: body => sideOf(body, scope),
    onNone: () =>
      Option.match(scope.operators.get(call.operator), {
        onSome: run => ran(call, run, scope),
        onNone: () => {
          // An operator only the server runs: a holder cannot say what it comes to.
          if (scope.judging) {
            return new Unheld(
              `this holder does not run the operator "${operatorName(call.operator)}"`,
            )
          }
          throw new OperatorMissingError(call.operator, scope.operators)
        },
      }),
  })
}

/**
 * A call of a primitive operator run, its arguments worked out over the
 * scope. With an argument not held it is not run: null when a strict
 * operator is given a null besides, as SQL's would be, else not known.
 */
const ran = (
  call: CallExpr<unknown> | TestPredicate,
  run: MemoryImplementation['run'],
  scope: Scope,
): unknown => {
  const values = call.args.map(arg => sideOf(arg, scope))
  const unheld = values.find(isUnheld)
  if (unheld !== undefined) {
    return call.operator.nulls === 'strict' && values.some(isNull) ? null : unheld
  }
  return runWith(
    call.operator,
    run,
    values,
    call.collation,
    call._tag === 'Test',
    scope.operators.checked,
  )
}

/**
 * A primitive operator run over values: strict about null and NUL before it
 * is asked, a throw it makes named as its own, and, in a checked table, its
 * answer held to its output schema (a predicate's null is its unknown).
 */
const runWith = (
  operator: OperatorDescriptor,
  run: MemoryImplementation['run'],
  values: ReadonlyArray<unknown>,
  collation: Option.Option<Collation>,
  predicate: boolean,
  checked: boolean,
): unknown => {
  // NUL before null: SQL refuses text holding it where it is compiled, whatever
  // else the call is given, so a null beside it must not answer first.
  if (values.some(holdsNul)) {
    throw new QueryEvaluateError(
      `the operator "${operatorName(operator)}" was given text holding a NUL character, which SQL text cannot hold portably`,
    )
  }
  if (operator.nulls === 'strict' && values.some(isNull)) return null
  let answer: unknown
  try {
    // A value never given (an input left out, a key the row lacks) is null to an
    // implementation that handles null, as SQL binds it.
    answer = run(
      values.map(value => (value === undefined ? null : value)),
      { collation },
    )
  } catch (error) {
    if (error instanceof QueryEvaluateError) throw error
    throw new QueryEvaluateError(
      `the operator "${operatorName(operator)}" failed: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  const unknownTruth = predicate && answer === null
  if (checked && !unknownTruth && !Schema.is(Schema.toEncoded(operator.output))(answer)) {
    throw new QueryEvaluateError(
      `the operator "${operatorName(operator)}" answered ${JSON.stringify(answer)}, which its output schema does not admit`,
    )
  }
  return answer
}

/**
 * A primitive operator over stored values, as a call of it is run: what a
 * computed assignment comes to (`Write.apply`). Refused, as a call is, when
 * `operators` does not implement it.
 */
export const applyOperator = (
  operator: OperatorDescriptor,
  values: ReadonlyArray<unknown>,
  options: {
    readonly collation: Option.Option<Collation>
    readonly operators: MemoryOperators
  },
): unknown =>
  Option.match(options.operators.get(operator), {
    onNone: () => {
      throw new OperatorMissingError(operator, options.operators)
    },
    onSome: run =>
      runWith(
        operator,
        run,
        values,
        options.collation,
        SchemaAST.isBoolean(Schema.toEncoded(operator.output).ast),
        options.operators.checked,
      ),
  })

/** A predicate operator's answer as a truth: null is unknown, anything but a boolean refused. */
const truthOf = (call: TestPredicate, answer: unknown): Judged => {
  if (isUnheld(answer)) return answer
  if (answer === null || answer === undefined) return 'unknown'
  if (typeof answer !== 'boolean') {
    throw new QueryEvaluateError(
      `the operator "${operatorName(call.operator)}" answered ${JSON.stringify(answer)}, which is not a truth`,
    )
  }
  return answer
}

/** SQL's unknown: neither true nor false, and a row is kept only on true. */
type Truth = boolean | 'unknown'

const isNull = (value: unknown): boolean => value === null || value === undefined

const { foldAscii } = Collation

const NUL = String.fromCharCode(0)

/**
 * Whether `value` is text holding a NUL, which Postgres text cannot hold and
 * SQLite compares only up to: no two interpreters agree on it.
 */
const holdsNul = (value: unknown): boolean => typeof value === 'string' && value.includes(NUL)

/**
 * Whether `value` is NaN, which no two interpreters agree on either: SQLite
 * stores it as null, Postgres orders it after every number and equal to
 * itself, JavaScript equal to nothing. Refused where values compare or
 * order, as NUL is.
 */
const isNaNValue = (value: unknown): boolean => typeof value === 'number' && Number.isNaN(value)

const refusedNaN = (what: string): QueryEvaluateError =>
  new QueryEvaluateError(
    `${what} was given NaN, which SQLite stores as null and Postgres orders after every number`,
  )

/** Refuses NaN given to a comparison (a literal or an input), before a null beside it answers. */
const refuseGivenNaN = (what: string, sides: ReadonlyArray<readonly [Operandish, unknown]>) => {
  if (
    sides.some(
      ([side, value]) =>
        !isPredicate(side) &&
        (side._tag === 'Literal' || side._tag === 'Input') &&
        isNaNValue(value),
    )
  ) {
    throw refusedNaN(what)
  }
}

/** A predicate used as a value is its own truth; anything else is its value. */
const sideOf = (node: Operandish, scope: Scope): unknown =>
  isPredicate(node) ? truthValue(holds(node, scope)) : valueOf(node, scope)

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
): unknown => {
  const value = sideOf(node, {
    row: noRow,
    input: options.input ?? {},
    next: noRow,
    operators: options.operators ?? Operators.kernel,
    judging: false,
    context: options.context,
  })
  if (isUnheld(value)) throw new RowsMissingError(value.reason)
  return value
}

/**
 * Refuses a value the query was given (a literal or an input) holding a NUL,
 * before any null beside it can answer: SQL refuses such a parameter where it
 * compiles, whatever the row holds. A NUL stored in a row is refused after,
 * as SQL meets it only beside a value that is not null.
 */
const refuseGivenNul = (
  message: string,
  sides: ReadonlyArray<readonly [Operandish, unknown]>,
): void => {
  if (
    sides.some(
      ([side, value]) =>
        !isPredicate(side) && (side._tag === 'Literal' || side._tag === 'Input') && holdsNul(value),
    )
  ) {
    throw new QueryEvaluateError(message)
  }
}

/**
 * A predicate compared as a value. SQL's unknown is null there too, so an
 * unknown compared to anything stays unknown rather than becoming false.
 */
const truthValue = (truth: Judged): unknown => (truth === 'unknown' ? null : truth)

/**
 * A predicate's truth, SQL's three values, or `Unheld` where it rests on what
 * the holder lacks. A null decides before anything unheld beside it, as it
 * decides SQL's answer whatever the other side holds; past that, what is not
 * held is not known, except where `and`'s false or `or`'s true settles it.
 */
const holds = (node: Predicate, scope: Scope): Judged => {
  switch (node._tag) {
    case 'Exists':
      return exists(node, scope)
    case 'Test':
      return truthOf(node, called(node, scope))
    case 'Eq': {
      const left = sideOf(node.left, scope)
      const right = sideOf(node.right, scope)
      // `null = anything` is unknown in SQL, including `null = null`. A row is
      // kept only when a comparison is true, so an unknown drops it either way;
      // saying so explicitly is what keeps this honest about three-valued logic
      // rather than accidentally right about it.
      const nul =
        'an equality was given text holding a NUL character, which SQL text cannot hold portably'
      refuseGivenNul(nul, [
        [node.left, left],
        [node.right, right],
      ])
      refuseGivenNaN('an equality', [
        [node.left, left],
        [node.right, right],
      ])
      if (isNull(left) || isNull(right)) return 'unknown'
      if (isUnheld(left)) return left
      if (isUnheld(right)) return right
      if (holdsNul(left) || holdsNul(right)) throw new QueryEvaluateError(nul)
      if (isNaNValue(left) || isNaNValue(right)) throw refusedNaN('an equality')
      return left === right
    }
    case 'Null': {
      // The one comparison SQL never leaves unknown: asking whether a value
      // is absent always has an answer, unless the value is not held.
      const value = valueOf(node.operand, scope)
      return isUnheld(value) ? value : isNull(value) !== node.present
    }
    case 'Contains': {
      const value = valueOf(node.value, scope)
      const search = sideOf(node.search, scope)
      // `null like anything` is unknown, which is why an empty search is not
      // the same as no filter over a column that can be null.
      refuseGivenNul(
        'a containment test was given text holding a NUL character, which SQL text cannot hold portably',
        [
          [node.search, search],
          [node.value, value],
        ],
      )
      if (isNull(value) || isNull(search)) return 'unknown'
      if (isUnheld(value)) return value
      if (isUnheld(search)) return search
      if (typeof value !== 'string' || typeof search !== 'string') {
        throw new QueryEvaluateError('a containment test was given something that is not text')
      }
      // Postgres text cannot hold NUL and SQLite's `like` stops at it, so no
      // two interpreters agree on such a value: refused rather than answered.
      if (holdsNul(value) || holdsNul(search)) {
        throw new QueryEvaluateError(
          'a containment test was given text holding a NUL character, which SQL text cannot hold portably',
        )
      }
      // Case-insensitive for ASCII letters only, because that is what
      // `Expr.contains` documents and what the compiled SQL folds both sides to.
      return foldAscii(value).includes(foldAscii(search))
    }
    case 'In': {
      const among = valueOf(node.among, scope)
      if (isUnheld(among)) return among
      if (!Array.isArray(among)) {
        throw new QueryEvaluateError('a membership test was given a list that is not a list')
      }
      // SQL's `in`: an empty list is false whatever the value, then a null
      // value is unknown, a match is true, and no match against a list
      // holding a null is unknown, since that null might have been it.
      if (among.length === 0) return false
      const value = valueOf(node.value, scope)
      if (holdsNul(value) || among.some(holdsNul)) {
        throw new QueryEvaluateError(
          'a membership test was given text holding a NUL character, which SQL text cannot hold portably',
        )
      }
      if (isNaNValue(value) || among.some(isNaNValue)) throw refusedNaN('a membership test')
      if (isNull(value)) return 'unknown'
      if (isUnheld(value)) return value
      if (among.some(each => each === value)) return true
      return among.some(isNull) ? 'unknown' : false
    }
    // Every operand is asked, with no short cut: SQL fixes no order, so one
    // that refuses its value (a NUL) refuses here whichever operand decided.
    case 'And': {
      const truths = node.operands.map(operand => holds(operand, scope))
      if (truths.includes(false)) return false
      // Unheld before SQL's unknown: with an unknown beside it, an unheld
      // operand could still make the whole false.
      const unheld = truths.find(isUnheld)
      if (unheld !== undefined) return unheld
      return truths.includes('unknown') ? 'unknown' : true
    }
    case 'Or': {
      const truths = node.operands.map(operand => holds(operand, scope))
      if (truths.includes(true)) return true
      const unheld = truths.find(isUnheld)
      if (unheld !== undefined) return unheld
      return truths.includes('unknown') ? 'unknown' : false
    }
    case 'Not': {
      const truth = holds(node.operand, scope)
      return truth === 'unknown' || isUnheld(truth) ? truth : !truth
    }
    case 'Compare': {
      const left = valueOf(node.left, scope)
      const right = valueOf(node.right, scope)
      const nul =
        'a comparison was given text holding a NUL character, which SQL text cannot hold portably'
      refuseGivenNul(nul, [
        [node.left, left],
        [node.right, right],
      ])
      refuseGivenNaN('a comparison', [
        [node.left, left],
        [node.right, right],
      ])
      if (isNull(left) || isNull(right)) return 'unknown'
      if (isUnheld(left)) return left
      if (isUnheld(right)) return right
      if (holdsNul(left) || holdsNul(right)) throw new QueryEvaluateError(nul)
      if (isNaNValue(left) || isNaNValue(right)) throw refusedNaN('a comparison')
      // Numbers with numbers and text with text, as `orderBy` compares them,
      // so a comparison and an ordering never disagree about what is first.
      const kind = typeof left
      if (kind !== typeof right || (kind !== 'number' && kind !== 'string')) {
        throw new QueryEvaluateError('a comparison was given values that do not order together')
      }
      const order = compare(left, right, node.collation)
      return Match.value(node.operator).pipe(
        Match.when('lt', () => order < 0),
        Match.when('lte', () => order <= 0),
        Match.when('gt', () => order > 0),
        Match.when('gte', () => order >= 0),
        Match.exhaustive,
      )
    }
  }
}

/** What a predicate comes to: SQL's three values, of which a row is kept only on `true`. */
export type PredicateTruth = Truth

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
  operators: MemoryOperators = Operators.kernel,
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
        settled(
          holds(node, { row: noRow, input, next: noRow, operators, judging: false, context }),
        ),
      )
}

/** A predicate's truth over one row (and, for an invariant, the row after a write): SQL's three values. */
export const truthOver = (
  node: Predicate,
  row: Row,
  input: Row = {},
  next: Row = {},
  operators: MemoryOperators = Operators.kernel,
): PredicateTruth =>
  settled(holds(node, { row: flat(row), input, next: flat(next), operators, judging: false }))

/**
 * What `Judge` comes to: known, or unknown because it rests on something the
 * holder lacks. A known predicate's truth is SQL's three values, its
 * `'unknown'` being SQL's null, which is decided: a row is not kept on it.
 */
export type Verdict<T = PredicateTruth> =
  | { readonly _tag: 'Known'; readonly truth: T }
  | { readonly _tag: 'Unknown'; readonly reason: string }

const known = <T>(truth: T): Verdict<T> => ({ _tag: 'Known', truth })
const unknownBecause = <T>(reason: string): Verdict<T> => ({ _tag: 'Unknown', reason })

/** What a verdict reads over, besides the row judged. */
interface JudgeOptions {
  readonly input?: Row | undefined
  readonly operators?: MemoryOperators | undefined
  /** What `Expr.viewer` and `Expr.now` read; a predicate reading one refuses a run without it. */
  readonly context?: ExprContext | undefined
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
  ): Verdict => {
    const judged = holds(predicate, {
      row: viewOf(row),
      input: options.input ?? {},
      next: options.next === undefined ? noRow : viewOf(options.next),
      operators: options.operators ?? Operators.kernel,
      judging: true,
      context: options.context,
    })
    return isUnheld(judged) ? unknownBecause(judged.reason) : known(judged)
  },

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
  ): Verdict<boolean> => {
    if (givenUnportable(body, [], input)) {
      throw new QueryEvaluateError(
        `query "${body.entity.name}" was given text holding a NUL character, or NaN, which no two backends agree on`,
      )
    }
    const scope: Scope = {
      row: viewOf(row),
      input,
      next: noRow,
      operators: options.operators ?? Operators.kernel,
      judging: true,
      context: options.context,
    }
    // Every predicate is asked, as `evaluate` asks them: one may refuse its value.
    const truths = body.where.map(each => holds(each, scope))
    if (truths.some(truth => truth === false || truth === 'unknown')) return known(false)
    const unheld = truths.find(isUnheld)
    if (unheld !== undefined) return unknownBecause(unheld.reason)
    return options.serverOnly === undefined
      ? known(true)
      : unknownBecause(`the server also filters by ${options.serverOnly}`)
  },

  match: <T, A>(
    verdict: Verdict<T>,
    cases: { readonly onKnown: (truth: T) => A; readonly onUnknown: (reason: string) => A },
  ): A =>
    verdict._tag === 'Known' ? cases.onKnown(verdict.truth) : cases.onUnknown(verdict.reason),
}

/** Every predicate must hold: the list is the conjunction, as it is in a `Query`. */
const matches = (
  body: AnyQuery,
  row: Row,
  input: Row,
  operators: MemoryOperators,
  context: ExprContext | undefined,
): boolean =>
  // Every predicate is asked, as `and` asks every operand: SQL fixes no order, so
  // one that refuses its value refuses whichever comes first in the list.
  body.where
    .map(node =>
      settled(
        holds(node, { row: flat(row), input, next: noRow, operators, judging: false, context }),
      ),
    )
    .every(truth => truth === true)

/** The kinds of value this interpreter orders by; every key of one term must share one. */
const comparable = new Set(['string', 'number', 'boolean'])

/**
 * Text by code point, as SQLite's `BINARY` and Postgres's `"C"` compare it.
 * JavaScript's `<` compares UTF-16 code units, which puts a character past
 * U+FFFF (two units, the first from U+D800) before U+E000 to U+FFFF, where
 * every byte-ordered backend puts it after.
 */
const byCodePoint = (left: string, right: string): number => {
  let i = 0
  let j = 0
  while (i < left.length && j < right.length) {
    const a = left.codePointAt(i)!
    const b = right.codePointAt(j)!
    if (a !== b) return a < b ? -1 : 1
    i += a > 0xffff ? 2 : 1
    j += b > 0xffff ? 2 : 1
  }
  return i < left.length ? 1 : j < right.length ? -1 : 0
}

/** Two keys of one term, text by its collation (code point when none is declared). */
const compare = (left: unknown, right: unknown, collation: Option.Option<Collation>): number => {
  if (typeof left === 'string' && typeof right === 'string') {
    const fold = Option.exists(collation, declared => declared._tag === 'AsciiFold')
    return fold ? byCodePoint(foldAscii(left), foldAscii(right)) : byCodePoint(left, right)
  }
  if (typeof left === 'boolean' && typeof right === 'boolean') {
    return Number(left) - Number(right)
  }
  return (left as number) - (right as number)
}

/** What an order's keys are worked out with: a call may read the input, and runs by the table. */
interface OrderScope {
  readonly input: Row
  readonly operators: MemoryOperators
  readonly context?: ExprContext | undefined
}

/** Each term's key for one row: a field's value, or what a call comes to over the row. */
const keysOf = (row: Row, terms: ReadonlyArray<OrderTerm>, scope: OrderScope) =>
  terms.map(term => {
    const key = valueOf(term.expr, {
      row: flat(row),
      input: scope.input,
      next: noRow,
      operators: scope.operators,
      judging: false,
      context: scope.context,
    })
    // One row's NaN would make every comparison with it NaN, and the sort of
    // every other row with it: refused for that row.
    if (isNaNValue(key)) throw refusedNaN(`an order by ${Expr.show(term.expr)}`)
    return key
  })

/**
 * Refuses an ordering this interpreter will not answer for, before sorting, so
 * the refusal names the first offending row in row order rather than whichever
 * pair the engine's sort happened to compare first. Every term is checked over
 * every row's keys: a key whose kind differs from the first present one's. A
 * null key is not refused; the term says where it goes.
 */
const checkOrder = (
  keys: ReadonlyArray<ReadonlyArray<unknown>>,
  terms: ReadonlyArray<OrderTerm>,
  query: string,
) =>
  terms.forEach((term, index) => {
    if (term.expr._tag !== 'Field' && term.expr._tag !== 'Call') {
      throw new QueryEvaluateError(
        `query "${query}" orders by something that is neither a field nor a call`,
      )
    }
    if (Option.exists(term.collation, declared => declared._tag === 'Locale')) {
      throw new QueryEvaluateError(
        `query "${query}" orders ${Expr.show(term.expr)} by a backend's locale collation, which only that backend has`,
      )
    }
    let first: string | undefined
    for (const row of keys) {
      const value = row[index]
      if (isNull(value)) continue
      const kind = typeof value
      first ??= kind
      if (kind !== first || !comparable.has(kind)) {
        throw new QueryEvaluateError(
          `query "${query}" orders by values this interpreter cannot compare (${first} and ${kind})`,
        )
      }
    }
  })

/** Two rows' keys by checked terms: negative when `left` sorts first. */
const byTerms = (
  terms: ReadonlyArray<OrderTerm>,
  left: ReadonlyArray<unknown>,
  right: ReadonlyArray<unknown>,
): number => {
  for (const [index, term] of terms.entries()) {
    const absentLeft = isNull(left[index])
    const absentRight = isNull(right[index])
    // Where a row without a value goes is the term's to say, whichever the
    // direction; two such rows tie, for the next term.
    if (absentLeft || absentRight) {
      if (absentLeft && absentRight) continue
      return absentLeft === (term.nulls === 'first') ? -1 : 1
    }
    const sign = compare(left[index], right[index], term.collation)
    if (sign !== 0) return term.direction === 'asc' ? sign : -sign
  }
  return 0
}

const ordered = (
  rows: ReadonlyArray<Row>,
  terms: ReadonlyArray<OrderTerm>,
  query: string,
  scope: OrderScope,
) => {
  // Keys are worked out and checked however few the rows, so a term refused over
  // one row is refused as it is over many, as `evaluateEach` refuses it.
  if (terms.length === 0) return [...rows]
  // Each row's keys worked out once, not once per comparison: a call may be dear.
  const keyed = rows.map(row => ({ row, keys: keysOf(row, terms, scope) }))
  checkOrder(
    keyed.map(({ keys }) => keys),
    terms,
    query,
  )
  return keyed.sort((left, right) => byTerms(terms, left.keys, right.keys)).map(({ row }) => row)
}

/**
 * Where `left` sorts against `right` under these terms (`Query.orderFor`'s),
 * as `evaluate` sorts: negative when it comes first. A call among them runs
 * over each row with `input` and `operators` (the kernel's when not given).
 * Refuses what `evaluate` refuses, for these two rows: a term over neither a
 * field nor a call, a locale collation, keys of different kinds, or an
 * operator the table lacks. For a client placing one row among others it
 * holds.
 */
export const compareRows = (
  terms: ReadonlyArray<OrderTerm>,
  left: Row,
  right: Row,
  query: string,
  options: {
    readonly input?: Row | undefined
    readonly operators?: MemoryOperators | undefined
    readonly context?: ExprContext | undefined
  } = {},
): number => {
  const scope = {
    input: options.input ?? {},
    operators: options.operators ?? Operators.kernel,
    context: options.context,
  }
  const keys = [keysOf(left, terms, scope), keysOf(right, terms, scope)] as const
  checkOrder(keys, terms, query)
  return byTerms(terms, keys[0], keys[1])
}

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
  operators: MemoryOperators = Operators.kernel,
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
  const operators = options.operators ?? Operators.kernel
  const { context } = options
  assertSupported(body, operators)
  return ordered(
    rows.filter(row => matches(body, row, input, operators, context)),
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
 * keys of different kinds across rows.
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
  const operators = options.operators ?? Operators.kernel
  const { context } = options
  assertSupported(body, operators)
  const terms = Query.orderFor(body, input)
  const scope = { input, operators, context }
  const keyed: Array<{ readonly row: Row; readonly keys: ReadonlyArray<unknown> }> = []
  const refused: Row[] = []
  for (const row of rows) {
    try {
      if (matches(body, row, input, operators, context))
        keyed.push({ row, keys: keysOf(row, terms, scope) })
    } catch (error) {
      if (
        !(error instanceof QueryEvaluateError) ||
        error instanceof ContextMissingError ||
        givenUnportable(body, terms, input)
      )
        throw error
      refused.push(row)
    }
  }
  checkOrder(
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

/**
 * Whether a constant or an input the body reads is one no two backends agree
 * on (text holding a NUL, NaN), or a list holding one: every row would refuse.
 */
const givenUnportable = (body: AnyQuery, terms: ReadonlyArray<OrderTerm>, input: Row): boolean =>
  Expr.givesUnportable(...body.where, ...terms.map(term => term.expr)) ||
  Query.dependencies(body).inputs.some(key => {
    const value = input[key]
    const unportable = (each: unknown) => holdsNul(each) || isNaNValue(each)
    return Array.isArray(value) ? value.some(unportable) : unportable(value)
  })
