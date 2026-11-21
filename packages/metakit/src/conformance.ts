/**
 * Conformance (`metakit/conformance`): every primitive operator, over the
 * values that trip readers up, held to one answer.
 *
 * `checkOpSoundness` takes an operator and, for each choice of awkward
 * operands and of Schemas that admit them, compares what evaluation gives
 * with what partial evaluation and the Tier 3 checker say: the residual must
 * evaluate alike, a `True` or `False` of the checker must be the value, an
 * interval must hold it, and assuming what is so must not be a contradiction.
 * The operators and their operand kinds are tables over `CoreOpId`, so a new
 * primitive fails to compile until it is covered here.
 */
import { Arbitrary, Effect, Match, Option, Result, Schema, Struct } from 'effect'
import { AbstractState, abstractOps, collectFields, type FieldInfo } from './abstract/check.js'
import * as Interval from './abstract/interval.js'
import * as Expr from './expr.js'
import * as Node from './node.js'
import * as Arr from './ops/arr.js'
import * as Bool from './ops/bool.js'
import * as Eq from './ops/eq.js'
import { evalNode } from './ops/eval.js'
import * as Null from './ops/null.js'
import * as Num from './ops/num.js'
import * as Ord from './ops/ord.js'
import { residualizeNode } from './ops/residualize.js'
import * as Str from './ops/str.js'
import { opProperties } from './properties.js'
import { checkProperties, sameAnswer, type PropertyReport } from './propertyChecks.js'
import * as Verdict from './verdict.js'

export { checkProperties, type PropertyFailure, type PropertyReport } from './propertyChecks.js'

/** Every primitive's descriptor: a new `CoreOpId` fails to compile until its operator is here. */
export const coreOps: { readonly [Id in Node.CoreOpId]: Node.Op<Id> } = {
  'bool.and': Bool.andOp,
  'bool.or': Bool.orOp,
  'bool.not': Bool.notOp,
  'eq.is': Eq.isOp,
  'eq.isNot': Eq.isNotOp,
  'eq.in': Eq.inOp,
  'eq.equals': Eq.equalsOp,
  'eq.among': Eq.amongOp,
  'null.isNull': Null.isNullOp,
  'null.coalesce': Null.coalesceOp,
  'str.lowerAscii': Str.lowerAsciiOp,
  'str.trim': Str.trimOp,
  'str.lt': Str.ltOp,
  'str.lte': Str.lteOp,
  'str.gt': Str.gtOp,
  'str.gte': Str.gteOp,
  'ord.lt': Ord.ltOp,
  'ord.lte': Ord.lteOp,
  'ord.gt': Ord.gtOp,
  'ord.gte': Ord.gteOp,
  'num.add': Num.addOp,
  'num.sub': Num.subOp,
  'num.mul': Num.mulOp,
  'num.neg': Num.negOp,
  'str.len': Str.lenOp,
  'str.startsWith': Str.startsWithOp,
  'str.contains': Str.containsOp,
  'arr.count': Arr.countOp,
  'arr.isEmpty': Arr.isEmptyOp,
}

/** What an operand is drawn from: a field of a kind, or a literal the call is written with. */
type Operand = 'number' | 'boolean' | 'text' | 'items' | 'value' | 'candidates'

/** Each primitive's operands. */
const operands: Readonly<Record<Node.CoreOpId, ReadonlyArray<Operand>>> = {
  'bool.and': ['boolean', 'boolean'],
  'bool.or': ['boolean', 'boolean'],
  'bool.not': ['boolean'],
  'eq.is': ['value', 'value'],
  'eq.isNot': ['value', 'value'],
  'eq.in': ['number', 'candidates'],
  'eq.equals': ['value', 'value'],
  'eq.among': ['number', 'candidates'],
  'null.isNull': ['value'],
  'null.coalesce': ['value', 'value'],
  'str.lowerAscii': ['text'],
  'str.trim': ['text'],
  'str.lt': ['text', 'text'],
  'str.lte': ['text', 'text'],
  'str.gt': ['text', 'text'],
  'str.gte': ['text', 'text'],
  'ord.lt': ['number', 'number'],
  'ord.lte': ['number', 'number'],
  'ord.gt': ['number', 'number'],
  'ord.gte': ['number', 'number'],
  'num.add': ['number', 'number'],
  'num.sub': ['number', 'number'],
  'num.mul': ['number', 'number'],
  'num.neg': ['number'],
  'str.len': ['text'],
  'str.startsWith': ['text', 'text'],
  'str.contains': ['text', 'text'],
  'arr.count': ['items'],
  'arr.isEmpty': ['items'],
}

/** One operand: what the environment holds, and a Schema that admits it (none: a literal). */
interface Sample {
  readonly label: string
  readonly value: unknown
  /** The key is left out of the environment. */
  readonly absent: boolean
  readonly schema: Option.Option<Schema.Top>
}

const field = (label: string, value: unknown, schema: Schema.Top): Sample => ({
  label,
  value,
  absent: false,
  schema: Option.some(schema),
})

const MAX = Number.MAX_SAFE_INTEGER

const near = (value: number, pad: number) =>
  Schema.isBetween({ minimum: Math.max(-MAX, value - pad), maximum: Math.min(MAX, value + pad) })

const integers = [0, 1, -3, MAX, -MAX].flatMap(value => [
  field(`${value} as itself`, value, Schema.Int.check(near(value, 0))),
  field(`${value} within 3`, value, Schema.Int.check(near(value, 3))),
  field(`${value} as an integer`, value, Schema.Int),
])

const numbers: ReadonlyArray<Sample> = [
  ...integers,
  field('0.5 within 3', 0.5, Schema.Finite.check(near(0.5, 3))),
  field('0.5 as a float', 0.5, Schema.Finite),
  field('1e200 as a float', 1e200, Schema.Finite),
  field('NaN', NaN, Schema.Number),
  field('Infinity', Infinity, Schema.Number),
  field('null integer', null, Schema.NullOr(Schema.Int)),
  field('null bounded float', null, Schema.NullOr(Schema.Finite.check(near(0, 3)))),
  {
    label: 'absent integer',
    value: null,
    absent: true,
    schema: Option.some(Schema.optionalKey(Schema.Int)),
  },
]

const booleans: ReadonlyArray<Sample> = [
  field('true', true, Schema.Boolean),
  field('false', false, Schema.Boolean),
  field('true or null', true, Schema.NullOr(Schema.Boolean)),
  field('null boolean', null, Schema.NullOr(Schema.Boolean)),
  {
    label: 'absent boolean',
    value: null,
    absent: true,
    schema: Option.some(Schema.optionalKey(Schema.Boolean)),
  },
]

const texts: ReadonlyArray<Sample> = [
  field('empty text', '', Schema.String),
  field('"ab"', 'ab', Schema.String),
  field('"🚀x"', '🚀x', Schema.String),
  field('" Ab\\t", upper case between white space', ' Ab\t', Schema.String),
  field('"\\uD83D", half of an astral character', '\uD83D', Schema.String),
  field('"a\\u0000b"', 'a\u0000b', Schema.String),
  field('"ab" or null', 'ab', Schema.NullOr(Schema.String)),
  field('null text', null, Schema.NullOr(Schema.String)),
]

const items: ReadonlyArray<Sample> = [
  field('no items', [], Schema.Array(Schema.String)),
  field('one item', ['x'], Schema.Array(Schema.String)),
  field('two items or null', ['x', 'y'], Schema.NullOr(Schema.Array(Schema.String))),
  field('null items', null, Schema.NullOr(Schema.Array(Schema.String))),
]

const literal = (value: unknown): Sample => ({
  label: `the literal ${JSON.stringify(value)}`,
  value,
  absent: false,
  schema: Option.none(),
})

const samples: Readonly<Record<Operand, ReadonlyArray<Sample>>> = {
  number: numbers,
  boolean: booleans,
  text: texts,
  items,
  value: [
    ...numbers.filter((_, index) => index % 3 === 0),
    ...booleans,
    ...texts,
    literal(null),
    literal(1),
    literal('ab'),
  ],
  candidates: [literal([]), literal([1]), literal([0, MAX]), literal([null]), literal([1, null])],
}

export interface OpFailure {
  readonly op: Node.CoreOpId
  /** Each operand, as its sample is named. */
  readonly operands: ReadonlyArray<string>
  /** What was claimed and is not so. */
  readonly claim: string
}

export interface OpReport {
  readonly op: Node.CoreOpId
  readonly ok: boolean
  readonly checked: number
  readonly failures: ReadonlyArray<OpFailure>
}

/** Every choice of one sample for each operand. */
const choices = (kinds: ReadonlyArray<Operand>): ReadonlyArray<ReadonlyArray<Sample>> =>
  kinds.reduce<ReadonlyArray<ReadonlyArray<Sample>>>(
    (chosen, kind) => chosen.flatMap(prefix => samples[kind].map(sample => [...prefix, sample])),
    [[]],
  )

/**
 * Hold one operator to one answer over every awkward operand: null, an absent
 * key, NaN, an infinity, the ends of the safe range, a float, the empty string
 * and an astral character, the empty array, each under Schemas that pin it,
 * bound it loosely or say only its type.
 */
export const checkOpSoundness = (id: Node.CoreOpId): OpReport => {
  const op: Node.Op = coreOps[id]
  const failures: Array<OpFailure> = []
  let checked = 0
  for (const chosen of choices(operands[id])) {
    const shape: Record<string, Schema.Top> = {}
    const env: Record<string, unknown> = {}
    chosen.forEach((sample, index) => {
      if (Option.isNone(sample.schema)) return
      shape[`x${index}`] = sample.schema.value
      if (!sample.absent) env[`x${index}`] = sample.value
    })
    const schema = Schema.Struct(shape)
    const fields = new Map<string, FieldInfo>()
    collectFields(schema.ast, [], fields)
    const args = chosen.map((sample, index) =>
      Option.match(sample.schema, {
        onNone: () => Node.Lit({ value: sample.value }),
        onSome: each => Node.Path({ segments: [`x${index}`], ast: Option.some(each.ast) }),
      }),
    )
    const call = Node.Call({ op, args })
    const concrete = evalNode(call, env)
    const fail = (claim: string): void => {
      failures.push({ op: id, operands: chosen.map(sample => sample.label), claim })
    }
    const expect = (holds: boolean, claim: string): void => {
      checked++
      if (!holds) fail(claim)
    }

    expect(
      sameAnswer(evalNode(residualizeNode(call, {}), env), concrete),
      'the residual over an unknown environment evaluates as the call does',
    )
    expect(
      sameAnswer(evalNode(residualizeNode(call, env), env), concrete),
      'the residual over the whole environment evaluates as the call does',
    )

    /** What a state says of the operands is so of the environment. */
    const facts = (state: AbstractState, when: string): void => {
      chosen.forEach((sample, index) => {
        const arg = args[index]!
        const value = sample.value
        if (!Node.$is('Path')(arg)) return
        const known = state.nullFacts.get(Node.key(arg))
        expect(known !== true || value === null, `${when}, x${index} is null`)
        expect(known !== false || value !== null, `${when}, x${index} is not null`)
        expect(
          !state.hasValue(arg) || (value !== null && !Number.isNaN(value)),
          `${when}, x${index} has a value`,
        )
        if (typeof value === 'number' && !Number.isNaN(value)) {
          expect(
            Interval.contains(state.evalInterval(arg), value),
            `${when}, x${index} lies in its interval`,
          )
        }
      })
    }

    const state = new AbstractState([call], fields)
    expect(state.propagate(), 'the Schemas of a real environment are satisfiable')
    facts(state, 'under the Schemas')
    expect(
      !state.hasValue(call) || (concrete !== null && !Node.isRefusal(concrete)),
      'a call said to have a value has one',
    )
    const assumed = (truth: boolean): void => {
      const next = state.clone()
      if (truth) next.assume(call)
      else next.refute(call)
      const reachable = next.propagate()
      expect(reachable, `assuming the call ${truth} is not a contradiction`)
      if (reachable) facts(next, `assuming the call ${truth}`)
    }
    Match.valueTags(abstractOps[id], {
      Predicate: () => {
        const verdict = state.decide(call)
        expect(!Verdict.isTrue(verdict) || concrete === true, 'a call decided True is true')
        expect(!Verdict.isFalse(verdict) || concrete === false, 'a call decided False is false')
        if (typeof concrete === 'boolean') assumed(concrete)
      },
      // Text or an operand: what is checked of it is that a value said to be one is.
      Value: () => {},
      Term: () => {
        if (typeof concrete !== 'number') return
        expect(
          Interval.contains(state.evalInterval(call), concrete),
          'the result lies in its interval',
        )
        expect(
          !state.isIntNode(call) || Number.isInteger(concrete),
          'an integer term is an integer',
        )
      },
    })
  }
  return { op: id, ok: failures.length === 0, checked, failures }
}

/** `checkOpSoundness` of every primitive. */
export const checkAllOps = (): ReadonlyArray<OpReport> => Struct.keys(coreOps).map(checkOpSoundness)

/** `checkProperties` of every primitive, against what `opProperties` declares of it. */
export const checkAllProperties = (): ReadonlyArray<PropertyReport> =>
  Struct.keys(coreOps).map(id =>
    checkProperties(coreOps[id], opProperties[id], {
      arity: operands[id].length,
      resolve: other => coreOps[other],
    }),
  )

/**
 * Property-test Tier 2 partial evaluation soundness against Tier 1 evaluation:
 *   ∀ env ~ schema:
 *     eval(residualize(expr, mask(env)), env) === eval(expr, env)
 * and where `judge` returns True or False, that is what `eval` gives.
 */
export const checkResidualizeSoundness = <S extends Schema.Top, A>(
  expr: Expr.Expr<S['Type'], A>,
  schema: S,
  mask: (env: S['Type']) => Expr.PartialEnv<S['Type']>,
  options?: { readonly samples?: number },
): {
  readonly ok: boolean
  readonly checked: number
  readonly mismatch?: {
    readonly env: S['Type']
    readonly full: Outcome<A>
    readonly residual: Outcome<A>
  }
} => {
  const arb = Arbitrary.schema(schema as unknown as Schema.Codec<S['Type']>)
  const envs = Effect.runSync(Arbitrary.sampleEffect(arb, { count: options?.samples ?? 60 }))
  let checked = 0
  for (const env of envs) {
    const partial = mask(env)
    const full = Expr.evalResult(expr, env)
    const residual = Expr.evalResult(Expr.residualize(expr, partial), env)
    checked++
    if (!sameOutcome(full, residual)) {
      return { ok: false, checked, mismatch: { env, full, residual } }
    }
    const v = Expr.judge(expr as unknown as Expr.Expr<S['Type'], boolean>, partial)
    const holds = Result.isSuccess(full) && full.success === true
    // `True` says it holds; `False` says it was answered and does not.
    if (
      (Verdict.isTrue(v) && !holds) ||
      (Verdict.isFalse(v) && (holds || Result.isFailure(full)))
    ) {
      return { ok: false, checked, mismatch: { env, full, residual } }
    }
  }
  return { ok: true, checked }
}

/** What evaluation gave: a value, null, or the refusal. */
export type Outcome<A> = Result.Result<A | null, Node.Refusal>

/** Two outcomes that are one answer: equal values, or refusals for one reason. */
export const sameOutcome = <A>(left: Outcome<A>, right: Outcome<A>): boolean =>
  sameAnswer(
    Result.match(left, { onSuccess: value => value, onFailure: refusal => refusal }),
    Result.match(right, { onSuccess: value => value, onFailure: refusal => refusal }),
  )
