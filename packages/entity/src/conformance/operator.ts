/**
 * An operator held to what it declares: one set of calls run through every
 * implementation given, their answers and refusals compared (`Conformance.operator`),
 * plus `checkOperation` and `lawObligations` from `@doeixd/metakit/conformance`.
 */
import { Data, Option, Schema, SchemaAST } from 'effect'
import {
  Collation,
  Operators,
  valueOfOperand,
  type MemoryOperators,
  type AnyExpr as Operandish,
  type Operator,
} from '../index.js'
import { tuplesOf } from './tuples.js'

type AnyOperator = Operator<ReadonlyArray<Schema.Top>, Schema.Top>

/** What an implementation said of one call: a value, or that it refused it. */
export type Outcome = Data.TaggedEnum<{
  Value: { readonly value: unknown }
  Refused: { readonly reason: string }
}>
export const Outcome = Data.taggedEnum<Outcome>()

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

const candidates = (ast: SchemaAST.AST): ReadonlyArray<unknown> => {
  if (SchemaAST.isString(ast) || SchemaAST.isTemplateLiteral(ast)) return texts
  if (SchemaAST.isNumber(ast)) return numbers
  if (SchemaAST.isBoolean(ast)) return booleans
  if (SchemaAST.isLiteral(ast)) return [ast.literal]
  if (SchemaAST.isUnion(ast)) return ast.types.flatMap(candidates)
  return []
}

const decodes = (schema: Schema.Top) => (value: unknown) =>
  Schema.is(Schema.toEncoded(schema))(value)

const samplesOf = (schemas: ReadonlyArray<Schema.Top>): ReadonlyArray<unknown> =>
  [...new Set(candidates(Schema.toEncoded(schemas[0]!).ast))].filter(
    value => value !== null && schemas.every(schema => decodes(schema)(value)),
  )

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

const keysOf = (record: Readonly<Record<string, unknown>>): ReadonlyArray<string> =>
  Object.keys(record).filter(key => record[key] !== undefined)

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
  return Object.is(left, right)
}

const same = (left: Outcome, right: Outcome): boolean =>
  Outcome.$match(left, {
    Value: ({ value }) => Outcome.$is('Value')(right) && sameValue(value, right.value),
    Refused: () => Outcome.$is('Refused')(right),
  })

const nameOf = (operator: AnyOperator): string =>
  operator.descriptor.version === 1
    ? operator.descriptor.id
    : `${operator.descriptor.id}@${operator.descriptor.version}`

const callOf = (
  operator: AnyOperator,
  args: ReadonlyArray<unknown>,
  collation: Option.Option<Collation>,
): Operandish =>
  Option.match(collation, {
    onNone: () => operator(...(args as ReadonlyArray<never>)),
    onSome: each => operator(...(args as ReadonlyArray<never>), { collation: each }),
  })

export const Conformance = {
  /** A runner backed by an in-memory operator table (default `Operators.kernel`). */
  memory:
    (table: MemoryOperators = Operators.kernel): Runner =>
    call =>
      valueOfOperand(call, { operators: table }),

  /**
   * Runs one set of calls of `op` through every implementation and compares
   * what each answered or refused.
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
      if (Object.hasOwn(runners, 'expansion')) {
        throw new Error(
          `[foldkit-entity] Conformance.operator: "expansion" names the expansion of ${nameOf(operator)}, which runs beside the implementations; name yours otherwise`,
        )
      }
      const table = options.expansionTable ?? Operators.kernel
      runners.expansion = call => valueOfOperand(call, { operators: table })
    }
    const generated = () =>
      tuplesOf(
        descriptor.input.map(schema => {
          const text = candidates(Schema.toEncoded(schema).ast).some(
            value => typeof value === 'string',
          )
          const nulls = decodes(schema)(null) ? [null] : []
          return [...nulls, ...samplesOf([schema]), ...(text ? [`a${NUL}`] : [])]
        }),
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
        const outcomes: Record<string, Outcome> = Object.create(null)
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
