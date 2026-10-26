/**
 * An operator held to what it declares (expr-operations-DESIGN §10.4): its
 * laws tested against an implementation, and one set of calls run through
 * every implementation given, their answers and refusals compared.
 *
 * Cases are drawn from a fixed sample of each kind of value (text with the
 * empty string, mixed case, non-ASCII and an astral character; numbers with
 * zero, negatives and a fraction; both booleans), kept where the operator's
 * input schema and the law's domain decode them, and chosen by a seeded
 * shuffle when there are more than asked for, so a run is repeatable.
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

type AnyOperator = Operator<ReadonlyArray<Schema.Top>, Schema.Top>

/** What an implementation said of one call: a value, or that it refused it. */
export type Outcome = Data.TaggedEnum<{
  Value: { readonly value: unknown }
  Refused: { readonly reason: string }
}>
export const Outcome = Data.taggedEnum<Outcome>()

/** What `Conformance.laws` found: every law held, with the evidence, or the first case one did not. */
export type LawsVerdict = Data.TaggedEnum<{
  Holds: { readonly evidence: ReadonlyArray<TestedEvidence> }
  Counterexample: {
    readonly law: LawDescription
    readonly args: ReadonlyArray<unknown>
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
const texts = ['', 'a', 'A', 'ab', 'aB', 'b', 'B', 'é', 'É', String.fromCodePoint(0x1f600)]
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

/** Two outcomes alike: equal values as stored, or both refusals. */
const same = (left: Outcome, right: Outcome): boolean =>
  left._tag === 'Refused' || right._tag === 'Refused'
    ? left._tag === right._tag
    : JSON.stringify(left.value) === JSON.stringify(right.value)

/** Two values of one kind in order: numbers, booleans, text by code point. */
const order = (left: unknown, right: unknown): number =>
  typeof left === 'string' && typeof right === 'string'
    ? left < right
      ? -1
      : left > right
        ? 1
        : 0
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

/** One equation's two sides for one tuple, and whether they keep the law. */
interface Check {
  readonly args: ReadonlyArray<unknown>
  readonly left: Outcome
  readonly right: Outcome
  readonly holds: boolean
}

const foldText = (value: unknown): unknown =>
  typeof value === 'string' ? Collation.foldAscii(value) : value

export const Conformance = {
  /** A runner of calls through a memory table: `Conformance.operator`'s for the in-memory interpreter. */
  memory:
    (operators: MemoryOperators): Runner =>
    call =>
      valueOfOperand(call, { operators }),

  /**
   * Tests every law `op` declares against `operators`' implementation of it,
   * up to `cases` tuples a law (200 by default), chosen by `seed` (0); a law
   * of both sides checks each tuple from each. Holds
   * with a `Tested` record a law, which `Operators.withEvidence` keeps; or the
   * first case a law fails, with both sides.
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
    const { descriptor } = operator
    const limit = options.cases ?? 200
    const seed = options.seed ?? 0
    const name = descriptor.version === 1 ? descriptor.id : `${descriptor.id}@${descriptor.version}`
    // The kernel compares text only under a collation, and literals bring none.
    const collation =
      descriptor.collation === 'none' ? Option.none<Collation>() : Option.some(Collation.binary)
    const outcome = (node: Operandish): Outcome => {
      try {
        return Outcome.Value({ value: valueOfOperand(node, { operators }) })
      } catch (error) {
        if (error instanceof QueryEvaluateError) return Outcome.Refused({ reason: error.message })
        throw error
      }
    }
    const call = (...args: ReadonlyArray<unknown>) => callOf(operator, args, collation)
    const check = (args: ReadonlyArray<unknown>, left: Outcome, right: Outcome): Check => ({
      args,
      left,
      right,
      holds: same(left, right),
    })
    const evidence: Array<TestedEvidence> = []
    for (const law of descriptor.laws) {
      const shared = samplesOf(descriptor.input, law.domain)
      const tuples = (arity: number) =>
        chosen(product(Array.from({ length: arity }, () => shared)), limit, seed)
      const sided = (
        value: unknown,
        side: 'left' | 'right' | 'both',
        answer: (a: unknown) => unknown,
      ) =>
        tuples(1).flatMap(([a]) => [
          ...(side === 'right'
            ? []
            : [check([value, a], outcome(call(value, a)), Outcome.Value({ value: answer(a) }))]),
          ...(side === 'left'
            ? []
            : [check([a, value], outcome(call(a, value)), Outcome.Value({ value: answer(a) }))]),
        ])
      const checks: ReadonlyArray<Check> = Law.$match(law, {
        Associative: () =>
          tuples(3).map(([a, b, c]) =>
            check([a, b, c], outcome(call(call(a, b), c)), outcome(call(a, call(b, c)))),
          ),
        Commutative: () =>
          tuples(2).map(([a, b]) => check([a, b], outcome(call(a, b)), outcome(call(b, a)))),
        Idempotent: () =>
          tuples(1).map(([a]) => check([a], outcome(call(a, a)), Outcome.Value({ value: a }))),
        Identity: ({ value, side }) => sided(value, side, a => a),
        Absorbing: ({ value, side }) => sided(value, side, () => value),
        Inverse: ({ other, identity }) =>
          tuples(1).map(([a]) =>
            check([a], outcome(call(a, other(a))), Outcome.Value({ value: identity })),
          ),
        Distributes: ({ over }) =>
          tuples(3).map(([a, b, c]) =>
            check([a, b, c], outcome(call(a, over(b, c))), outcome(over(call(a, b), call(a, c)))),
          ),
        Monotonic: ({ direction, position }) => {
          const each = descriptor.input.map(schema => samplesOf([schema], law.domain))
          const pairs = each[position]!.flatMap(low =>
            each[position]!.filter(high => order(low, high) < 0).map(high => [low, high] as const),
          )
          const rest = product(each.filter((_, index) => index !== position))
          return chosen(product([pairs, rest]), limit, seed).map(([pair, others]) => {
            const [low, high] = pair as readonly [unknown, unknown]
            const at = (value: unknown) => {
              const args = [...(others as ReadonlyArray<unknown>)]
              args.splice(position, 0, value)
              return args
            }
            const left = outcome(call(...at(low)))
            const right = outcome(call(...at(high)))
            const sign = direction === 'increasing' ? 1 : -1
            return {
              args: at(low),
              left,
              right,
              holds:
                left._tag === 'Value' &&
                right._tag === 'Value' &&
                sign * order(left.value, right.value) <= 0,
            }
          })
        },
        PreservesCollation: () =>
          tuples(2).map(([a, b]) => {
            const folded = (node: Operandish) =>
              Outcome.$match(outcome(node), {
                Value: ({ value }) => Outcome.Value({ value: foldText(value) }),
                Refused: refused => refused,
              })
            const under = (x: unknown, y: unknown) =>
              callOf(operator, [x, y], Option.some(Collation.asciiFold))
            return check([a, b], folded(under(a, b)), folded(under(foldText(a), foldText(b))))
          }),
      })
      if (checks.length === 0) {
        throw new Error(
          `[foldkit-entity] Conformance.laws: no sample of ${name}'s arguments is in ${Law.describe(law).kind}'s domain`,
        )
      }
      const failed = checks.find(each => !each.holds)
      if (failed !== undefined) {
        return LawsVerdict.Counterexample({
          law: Law.describe(law),
          args: failed.args,
          left: failed.left,
          right: failed.right,
        })
      }
      evidence.push(
        Evidence.Tested({
          operator: name,
          law: Law.describe(law),
          implementation: options.implementation ?? 'memory',
          cases: checks.length,
          seed,
        }),
      )
    }
    return LawsVerdict.Holds({ evidence })
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
