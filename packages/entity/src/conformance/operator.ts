/**
 * An operator held to what it declares (expr-operations-DESIGN §10.4): its
 * laws tested against an implementation, and one set of calls run through
 * every implementation given, their answers and refusals compared.
 *
 * Cases are drawn from a fixed sample of each kind of value (text with the
 * empty string, mixed case, non-ASCII, an astral character and `like`'s
 * wildcards; numbers with zero, negatives and a fraction; both booleans), kept
 * where the operator's input schema and the law's domain decode them, and
 * chosen by a seeded shuffle when there are more than asked for, so a run is
 * repeatable.
 */
import { Data, Option, Schema, SchemaAST } from 'effect'
import {
  Collation,
  Evidence,
  Expr,
  Law,
  Operators,
  QueryEvaluateError,
  valueOfOperand,
  type LawDescription,
  type MemoryOperators,
  type Operandish,
  type Operator,
  type TestedEvidence,
} from '../index.js'
import { stampRun, stampTested } from '../tested.js'

type AnyOperator = Operator<ReadonlyArray<Schema.Top>, Schema.Top>

/** What an implementation said of one call: a value, or that it refused it. */
export type Outcome = Data.TaggedEnum<{
  Value: { readonly value: unknown }
  Refused: { readonly reason: string }
}>
export const Outcome = Data.taggedEnum<Outcome>()

/**
 * What `Conformance.laws` found: every law held, with the evidence; the first
 * case one did not; or a law no case of which both sides answered, which
 * shows nothing of it.
 */
export type LawsVerdict = Data.TaggedEnum<{
  Holds: { readonly evidence: ReadonlyArray<TestedEvidence> }
  Unanswered: {
    readonly law: LawDescription
    /** Why the first refused call was refused. */
    readonly reason: string
  }
  Counterexample: {
    readonly law: LawDescription
    readonly args: ReadonlyArray<unknown>
    /** The collation the calls were made under, for an operator that compares text. */
    readonly collation: Option.Option<Collation>
    readonly left: Outcome
    readonly right: Outcome
  }
}>
export const LawsVerdict = Data.taggedEnum<LawsVerdict>()

/**
 * One way to run a call: its value, or a throw for a call it refuses. A call
 * of a predicate answers its truth, unknown as `null`.
 */
export type Runner = (call: Operandish) => unknown

/** A call the implementations did not agree on, with what each said. */
export interface Disagreement {
  readonly args: ReadonlyArray<unknown>
  readonly collation: Option.Option<Collation>
  readonly outcomes: Readonly<Record<string, Outcome>>
}

export interface OperatorReport {
  /** How many calls ran, each through every implementation. */
  readonly cases: number
  readonly disagreements: ReadonlyArray<Disagreement>
}

const NUL = String.fromCharCode(0)
// 'B' sorts before 'a' by code point and after it folded: what tells the collations apart.
// `%`, `_` and `\` are what `like` reads as wildcards and its escape.
const texts = [
  '',
  'a',
  'A',
  'ab',
  'aB',
  'b',
  'B',
  'é',
  'É',
  String.fromCodePoint(0x1f600),
  '%',
  '_',
  '\\',
]
const numbers = [-2, -1, 0, 1, 2, 7, 0.5, -0.5, 1e6]
const booleans = [true, false]

/** The sample values of a stored kind, before any schema narrows them. */
const candidates = (ast: SchemaAST.AST): ReadonlyArray<unknown> => {
  if (SchemaAST.isString(ast) || SchemaAST.isTemplateLiteral(ast)) return texts
  if (SchemaAST.isNumber(ast)) return numbers
  if (SchemaAST.isBoolean(ast)) return booleans
  if (SchemaAST.isLiteral(ast)) return [ast.literal]
  if (SchemaAST.isUnion(ast)) return ast.types.flatMap(candidates)
  return []
}

/** Whether a stored value is one `schema` stores. */
const decodes = (schema: Schema.Top) => (value: unknown) =>
  Schema.is(Schema.toEncoded(schema))(value)

/** The non-null samples every schema of `schemas` decodes, and the domain too when one is given. */
const samplesOf = (
  schemas: ReadonlyArray<Schema.Top>,
  domain: Option.Option<Schema.Top>,
): ReadonlyArray<unknown> =>
  [...new Set(candidates(Schema.toEncoded(schemas[0]!).ast))].filter(
    value =>
      value !== null &&
      schemas.every(schema => decodes(schema)(value)) &&
      Option.match(domain, { onNone: () => true, onSome: within => decodes(within)(value) }),
  )

/** Every tuple of one value from each list. */
const product = (
  lists: ReadonlyArray<ReadonlyArray<unknown>>,
): ReadonlyArray<ReadonlyArray<unknown>> =>
  lists.reduce<ReadonlyArray<ReadonlyArray<unknown>>>(
    (tuples, list) => tuples.flatMap(tuple => list.map(value => [...tuple, value])),
    [[]],
  )

/** A small seeded generator (mulberry32), so a chosen subset is the same on every run. */
const random = (seed: number) => {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** At most `limit` of the tuples, a seeded shuffle choosing which when there are more. */
const chosen = <A>(tuples: ReadonlyArray<A>, limit: number, seed: number): ReadonlyArray<A> => {
  if (tuples.length <= limit) return tuples
  const next = random(seed)
  const shuffled = [...tuples]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!]
  }
  return shuffled.slice(0, limit)
}

/** A plain object: what JSON makes, and nothing whose data sits in a prototype. */
const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

/** A plain object's keys holding a value: one holding `undefined` is as absent, as JSON writes it. */
const keysOf = (record: Readonly<Record<string, unknown>>): ReadonlyArray<string> =>
  Object.keys(record).filter(key => record[key] !== undefined)

/**
 * Two stored values alike, structurally. Not by their JSON, which writes
 * `Infinity` and `NaN` as `null`: a division by zero answering `Infinity` in
 * memory and null in SQL would read as agreeing. An object that is not plain
 * (its data in a prototype: a Date) is compared by its JSON, a Date's its time.
 */
const sameValue = (left: unknown, right: unknown): boolean => {
  if (typeof left === 'number' && typeof right === 'number') {
    return left === right || (Number.isNaN(left) && Number.isNaN(right))
  }
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((each, i) => sameValue(each, right[i]))
  }
  if (isRecord(left) && isRecord(right)) {
    const keys = keysOf(left)
    return (
      keys.length === keysOf(right).length &&
      keys.every(key => Object.hasOwn(right, key) && sameValue(left[key], right[key]))
    )
  }
  if (typeof left === 'object' && left !== null && typeof right === 'object' && right !== null) {
    return JSON.stringify(left) === JSON.stringify(right)
  }
  return left === right
}

/** Two outcomes alike: equal values as stored, or both refusals. */
const same = (left: Outcome, right: Outcome): boolean =>
  left._tag === 'Refused' || right._tag === 'Refused'
    ? left._tag === right._tag
    : sameValue(left.value, right.value)

/** Text by code point, as every interpreter's `binary` orders it; `<` compares UTF-16 units. */
const byCodePoint = (left: string, right: string): number => {
  const [a, b] = [[...left], [...right]]
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const sign = a[i]!.codePointAt(0)! - b[i]!.codePointAt(0)!
    if (sign !== 0) return sign
  }
  return a.length - b.length
}

/** Two values of one kind in order: numbers, booleans, text by code point. */
const orderOf = (left: unknown, right: unknown): number =>
  typeof left === 'string' && typeof right === 'string'
    ? byCodePoint(left, right)
    : Number(left) - Number(right)

/** A call of `op`, given `collation` when its rule takes one. */
const callOf = (
  op: AnyOperator,
  args: ReadonlyArray<unknown>,
  collation: Option.Option<Collation>,
): Operandish =>
  Option.match(collation, {
    onNone: () => op(...args),
    onSome: each => op(...args, { collation: each }),
  })

/** One side of an equation: a call to run (its text folded first, for a collation law), or a value. */
type Side = { readonly node: Operandish; readonly fold: boolean } | { readonly value: unknown }

/** One equation for one tuple: its two sides, and what makes their outcomes keep the law. */
interface Plan {
  readonly args: ReadonlyArray<unknown>
  readonly collation: Option.Option<Collation>
  readonly left: Side
  readonly right: Side
  readonly holds: (left: Outcome, right: Outcome) => boolean
}

/** Each law `op` declares, with its equations: what `laws` and `lawsBy` evaluate. */
interface LawPlans {
  readonly law: LawDescription
  readonly plans: ReadonlyArray<Plan>
}

const foldText = (value: unknown): unknown =>
  typeof value === 'string' ? Collation.foldAscii(value) : value

const nameOf = (op: AnyOperator): string =>
  op.descriptor.version === 1 ? op.descriptor.id : `${op.descriptor.id}@${op.descriptor.version}`

/**
 * The equations of every law `op` declares, over up to `limit` tuples a law
 * chosen by `seed`. Nothing is run: a memory table and an SQL runner
 * evaluate the same plans.
 */
const lawPlans = (op: AnyOperator, limit: number, seed: number): ReadonlyArray<LawPlans> => {
  const { descriptor } = op
  const comparesText = (each: AnyOperator) => each.descriptor.collation !== 'none'
  // Each operator is called under a collation only where it compares text.
  const under = (each: AnyOperator, collation: Option.Option<Collation>) =>
    comparesText(each) ? collation : Option.none<Collation>()
  const run = (node: Operandish): Side => ({ node, fold: false })
  const value = (held: unknown): Side => ({ value: held })
  return descriptor.laws.map(law => {
    const shared = samplesOf(descriptor.input, law.domain)
    const tuples = (arity: number) =>
      chosen(product(Array.from({ length: arity }, () => shared)), limit, seed)
    // The kernel compares text only under a collation, and literals bring none. An
    // implementation is told the collation, and may answer differently under each:
    // a pass under each where `op`, or a witness the law calls, compares text.
    const witnesses = Law.$match(law, {
      Inverse: ({ other }) => [other],
      Distributes: ({ over }) => [over],
      Associative: () => [],
      Commutative: () => [],
      Idempotent: () => [],
      Identity: () => [],
      Absorbing: () => [],
      Monotonic: () => [],
      PreservesCollation: () => [],
    })
    const collations = [op, ...witnesses].some(comparesText)
      ? [Option.some(Collation.binary), Option.some(Collation.asciiFold)]
      : [Option.none<Collation>()]
    const plans = collations.flatMap((collation): ReadonlyArray<Plan> => {
      const call = (...args: ReadonlyArray<unknown>) => callOf(op, args, under(op, collation))
      // A witness operator is called as `op` is: under the collation when it compares text.
      const witness = (other: AnyOperator, ...args: ReadonlyArray<unknown>) =>
        callOf(other, args, under(other, collation))
      const equal = (args: ReadonlyArray<unknown>, left: Side, right: Side): Plan => ({
        args,
        collation,
        left,
        right,
        holds: same,
      })
      const sided = (
        witness: unknown,
        side: 'left' | 'right' | 'both',
        answer: (a: unknown) => unknown,
      ) =>
        tuples(1).flatMap(([a]) => [
          ...(side === 'right'
            ? []
            : [equal([witness, a], run(call(witness, a)), value(answer(a)))]),
          ...(side === 'left'
            ? []
            : [equal([a, witness], run(call(a, witness)), value(answer(a)))]),
        ])
      return Law.$match(law, {
        Associative: () =>
          tuples(3).map(([a, b, c]) =>
            equal([a, b, c], run(call(call(a, b), c)), run(call(a, call(b, c)))),
          ),
        Commutative: () =>
          tuples(2).map(([a, b]) => equal([a, b], run(call(a, b)), run(call(b, a)))),
        Idempotent: () => tuples(1).map(([a]) => equal([a], run(call(a, a)), value(a))),
        Identity: ({ value: witness, side }) => sided(witness, side, a => a),
        Absorbing: ({ value: witness, side }) => sided(witness, side, () => witness),
        Inverse: ({ other, identity }) =>
          tuples(1).map(([a]) => equal([a], run(call(a, witness(other, a))), value(identity))),
        Distributes: ({ over }) =>
          tuples(3).map(([a, b, c]) =>
            equal(
              [a, b, c],
              run(call(a, witness(over, b, c))),
              run(witness(over, call(a, b), call(a, c))),
            ),
          ),
        Monotonic: ({ direction, position }) => {
          // Text in order as the collation orders it, folded under asciiFold.
          const under = (held: unknown) =>
            Option.exists(collation, each => each._tag === 'AsciiFold') ? foldText(held) : held
          const order = (left: unknown, right: unknown) => orderOf(under(left), under(right))
          const each = descriptor.input.map(schema => samplesOf([schema], law.domain))
          const pairs = each[position]!.flatMap(low =>
            each[position]!.filter(high => order(low, high) < 0).map(high => [low, high] as const),
          )
          const rest = product(each.filter((_, index) => index !== position))
          const sign = direction === 'increasing' ? 1 : -1
          return chosen(product([pairs, rest]), limit, seed).map(([pair, others]) => {
            const [low, high] = pair as readonly [unknown, unknown]
            const at = (held: unknown) => {
              const args = [...(others as ReadonlyArray<unknown>)]
              args.splice(position, 0, held)
              return args
            }
            return {
              args: at(low),
              collation,
              left: run(call(...at(low))),
              right: run(call(...at(high))),
              holds: (left: Outcome, right: Outcome) =>
                left._tag === 'Value' &&
                right._tag === 'Value' &&
                sign * order(left.value, right.value) <= 0,
            }
          })
        },
        // A law about the fold itself: its equations are made once, in the asciiFold pass.
        PreservesCollation: () =>
          Option.exists(collation, each => each._tag === 'AsciiFold')
            ? tuples(2).map(([a, b]) =>
                equal(
                  [a, b],
                  { node: call(a, b), fold: true },
                  { node: call(foldText(a), foldText(b)), fold: true },
                ),
              )
            : [],
      })
    })
    if (plans.length === 0) {
      throw new Error(
        `[foldkit-entity] Conformance.laws: no sample of ${nameOf(op)}'s arguments is in ${Law.describe(law).kind}'s domain`,
      )
    }
    return { law: Law.describe(law), plans }
  })
}

/**
 * The verdict over laws whose calls' outcomes `answered` gives: the first
 * failure, or evidence of each. Two sides that both refuse agree, as a law
 * over values says nothing of a call neither answers, but they are no case of
 * it: a law is shown only by the cases whose sides both answer a value, and
 * one with none is `Unanswered`.
 */
const verdictOf = (
  op: AnyOperator,
  laws: ReadonlyArray<LawPlans>,
  answered: (node: Operandish) => Outcome,
  options: { readonly implementation: string; readonly seed: number },
): LawsVerdict => {
  const outcomes = (side: Side): Outcome => {
    if ('value' in side) return Outcome.Value({ value: side.value })
    const outcome = answered(side.node)
    return side.fold
      ? Outcome.$match(outcome, {
          Value: ({ value }) => Outcome.Value({ value: foldText(value) }),
          Refused: refused => refused,
        })
      : outcome
  }
  const evidence: Array<TestedEvidence> = []
  for (const { law, plans } of laws) {
    let cases = 0
    let refusal = Option.none<string>()
    for (const plan of plans) {
      const left = outcomes(plan.left)
      const right = outcomes(plan.right)
      if (!plan.holds(left, right)) {
        return LawsVerdict.Counterexample({
          law,
          args: plan.args,
          collation: plan.collation,
          left,
          right,
        })
      }
      if (left._tag === 'Value' && right._tag === 'Value') cases += 1
      else if (Option.isNone(refusal) && left._tag === 'Refused') refusal = Option.some(left.reason)
    }
    if (cases === 0) {
      return LawsVerdict.Unanswered({
        law,
        reason: Option.getOrElse(refusal, () => 'no call was answered'),
      })
    }
    evidence.push(
      Evidence.Tested({
        operator: nameOf(op),
        law,
        implementation: options.implementation,
        cases,
        seed: options.seed,
      }),
    )
  }
  return LawsVerdict.Holds({ evidence })
}

export const Conformance = {
  /** A runner of calls through a memory table: `Conformance.operator`'s for the in-memory interpreter. */
  memory:
    (operators: MemoryOperators): Runner =>
    call =>
      valueOfOperand(call, { operators }),

  /**
   * Tests every law `op` declares against `operators`' implementation of it,
   * up to `cases` tuples a law (200 by default), chosen by `seed` (0); a law
   * of both sides checks each tuple from each. Holds with a `Tested` record a
   * law, which `Operators.withEvidence` keeps; or the first case a law fails,
   * with both sides.
   */
  laws: <In extends ReadonlyArray<Schema.Top>, Out extends Schema.Top>(
    op: Operator<In, Out>,
    operators: MemoryOperators,
    options: {
      readonly implementation?: string | undefined
      readonly cases?: number | undefined
      readonly seed?: number | undefined
    } = {},
  ): LawsVerdict => {
    const operator: AnyOperator = op
    const seed = options.seed ?? 0
    const outcome = (node: Operandish): Outcome => {
      try {
        return Outcome.Value({ value: valueOfOperand(node, { operators }) })
      } catch (error) {
        if (error instanceof QueryEvaluateError) return Outcome.Refused({ reason: error.message })
        throw error
      }
    }
    const verdict = verdictOf(operator, lawPlans(operator, options.cases ?? 200, seed), outcome, {
      implementation: options.implementation ?? 'memory',
      seed,
    })
    // Each record is of this table's implementations, its witnesses' too, which `withEvidence` checks.
    if (verdict._tag === 'Holds') verdict.evidence.forEach(record => stampTested(record, operators))
    return verdict
  },

  /**
   * As `laws`, each call run by `run` instead of a memory table: an SQL
   * implementation selected from a database, say, whose evidence a binding's
   * SQL table records. A throw is a refusal.
   */
  lawsBy: async <In extends ReadonlyArray<Schema.Top>, Out extends Schema.Top>(
    op: Operator<In, Out>,
    run: Runner,
    options: {
      readonly implementation: string
      readonly cases?: number | undefined
      readonly seed?: number | undefined
    },
  ): Promise<LawsVerdict> => {
    const operator: AnyOperator = op
    const seed = options.seed ?? 0
    const laws = lawPlans(operator, options.cases ?? 200, seed)
    const answers = new Map<Operandish, Outcome>()
    for (const { plans } of laws) {
      for (const side of plans.flatMap(plan => [plan.left, plan.right])) {
        if (!('node' in side) || answers.has(side.node)) continue
        try {
          answers.set(side.node, Outcome.Value({ value: await run(side.node) }))
        } catch (error) {
          answers.set(side.node, Outcome.Refused({ reason: String(error) }))
        }
      }
    }
    // Every call was run above, so each has its answer.
    const verdict = verdictOf(operator, laws, node => answers.get(node)!, {
      implementation: options.implementation,
      seed,
    })
    // Each record is a runner's, which an SQL table's `withEvidence` checks.
    if (verdict._tag === 'Holds') verdict.evidence.forEach(stampRun)
    return verdict
  },

  /**
   * Runs one set of calls of `op` through every implementation and compares
   * what each answered or refused. The calls are `cases` (argument tuples, as
   * stored), or generated: each argument a sample of its kind, null where its
   * schema admits one, and text holding NUL, under `binary` and `asciiFold` where the operator compares
   * text, up to `limit` (300) chosen by `seed` (0). A defined operator's
   * expansion is run beside the others, as `expansion`, by `expansionTable`
   * (the kernel's when not given).
   */
  operator: async <In extends ReadonlyArray<Schema.Top>, Out extends Schema.Top>(
    op: Operator<In, Out>,
    options: {
      readonly implementations: Readonly<Record<string, Runner>>
      readonly cases?: ReadonlyArray<ReadonlyArray<unknown>> | undefined
      readonly limit?: number | undefined
      readonly seed?: number | undefined
      readonly expansionTable?: MemoryOperators | undefined
    },
  ): Promise<OperatorReport> => {
    const operator: AnyOperator = op
    const { descriptor } = operator
    const runners: Record<string, Runner> = { ...options.implementations }
    if (Option.isSome(descriptor.definedAs)) {
      const table = options.expansionTable ?? Operators.kernel
      runners.expansion = call => valueOfOperand(Expr.expanded(call), { operators: table })
    }
    const generated = () =>
      chosen(
        product(
          descriptor.input.map(schema => {
            const text = candidates(Schema.toEncoded(schema).ast).some(
              value => typeof value === 'string',
            )
            // Null only where the schema admits it: a call refuses a null literal otherwise.
            const nulls = decodes(schema)(null) ? [null] : []
            return [...nulls, ...samplesOf([schema], Option.none()), ...(text ? [`a${NUL}`] : [])]
          }),
        ),
        options.limit ?? 300,
        options.seed ?? 0,
      )
    const collations =
      descriptor.collation === 'none'
        ? [Option.none<Collation>()]
        : [Option.some(Collation.binary), Option.some(Collation.asciiFold)]
    const disagreements: Array<Disagreement> = []
    let cases = 0
    for (const args of options.cases ?? generated()) {
      for (const collation of collations) {
        cases += 1
        const call = callOf(operator, args, collation)
        const outcomes: Record<string, Outcome> = {}
        for (const [name, run] of Object.entries(runners)) {
          try {
            outcomes[name] = Outcome.Value({ value: await run(call) })
          } catch (error) {
            outcomes[name] = Outcome.Refused({ reason: String(error) })
          }
        }
        const [first, ...others] = Object.values(outcomes)
        if (first !== undefined && others.some(each => !same(first, each))) {
          disagreements.push({ args, collation, outcomes })
        }
      }
    }
    return { cases, disagreements }
  },
}
