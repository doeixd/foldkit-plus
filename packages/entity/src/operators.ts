/**
 * How the in-memory interpreter runs primitive operators: a table of
 * implementations, passed to `evaluate` and every judge as a value. A table is
 * immutable and implements each operator once; nothing registers anything
 * globally.
 */
import type { Collation } from './collation.js'
import { Option, Schema } from 'effect'
import type { Operator, OperatorDescriptor } from './expr/operator.js'
import type { OperatorTable } from './expr/table.js'
import { jsonSchemaOf } from './jsonSchema.js'
import { fail, implementation, kernelOperators, nameOf, table } from './memoryTable.js'

/** What an implementation is told besides its arguments. */
export interface OperatorContext {
  /** The collation the call compares text under, from its operator's `collation` rule. */
  readonly collation: Option.Option<Collation>
}

/** One operator's in-memory implementation: a pure function of stored values. */
export interface MemoryImplementation {
  readonly operator: OperatorDescriptor
  readonly run: (args: ReadonlyArray<unknown>, context: OperatorContext) => unknown
}

/** A JSON Schema document's root: an object (`$defs` holds what it refers to). */
const JsonSchema = Schema.Record(Schema.String, Schema.Unknown)

/**
 * An operator as JSON, by its signature and never its body (a defined
 * operator says `defined`, not what it means): what a server can publish of
 * what a body may call, and a client compare with what it runs. Its schemas
 * are each argument's and the result's stored side, as JSON Schemas.
 */
export const OperatorDescription = Schema.Struct({
  /** By id, and `@version` past the first: what tables and refusals name. */
  name: Schema.String,
  id: Schema.String,
  version: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  description: Schema.NullOr(Schema.String),
  input: Schema.Array(JsonSchema),
  output: JsonSchema,
  nulls: Schema.Literals(['strict', 'own']),
  collation: Schema.Literals(['none', 'operands', 'required']),
  claims: Schema.Record(Schema.String, Schema.Unknown),
  defined: Schema.Boolean,
})
export type OperatorDescription = typeof OperatorDescription.Type

const describeClaims = (
  claims: OperatorDescriptor['claims'],
): Readonly<Record<string, unknown>> => {
  const out: Record<string, unknown> = {}
  if (claims.identity !== undefined) out['identity'] = claims.identity
  if (claims.absorbing !== undefined) out['absorbing'] = claims.absorbing
  if (claims.idempotent === true) out['idempotent'] = true
  if (claims.commutative === true) out['commutative'] = true
  if (claims.associative !== undefined) out['associative'] = claims.associative
  if (claims.invertible !== undefined) {
    out['invertible'] = {
      inverse:
        claims.invertible.inverse === 'self'
          ? 'self'
          : `${claims.invertible.inverse.id}@${claims.invertible.inverse.version}`,
    }
  }
  if (claims.monotone !== undefined) out['monotone'] = [...claims.monotone]
  return out
}

const described = (operator: OperatorDescriptor): OperatorDescription => ({
  name: nameOf(operator),
  id: operator.id,
  version: operator.version,
  description: Option.getOrNull(operator.description),
  input: operator.input.map(jsonSchemaOf),
  output: jsonSchemaOf(operator.output),
  nulls: operator.nulls,
  collation: operator.collation,
  claims: describeClaims(operator.claims),
  defined: Option.isSome(operator.definedAs),
})

/** The in-memory interpreter's implementations, by operator. */
export interface MemoryOperators extends OperatorTable {
  readonly _tag: 'MemoryOperators'
  readonly get: (operator: OperatorDescriptor) => Option.Option<MemoryImplementation['run']>
  /**
   * The operator it implements under a name (`id`, or `id@version` past the
   * first): how a computed assignment carried as data finds what to run.
   */
  readonly named: (name: string) => Option.Option<OperatorDescriptor>
  /** Whether each answer is checked against its operator's output schema: for tests. */
  readonly checked: boolean
  readonly implementations: ReadonlyArray<MemoryImplementation>
}

type StoredOf<S extends Schema.Top> = Schema.Codec.Encoded<S>

export const Operators = {
  /**
   * An implementation of a strict operator: a pure function of its arguments'
   * stored values, never given a null (the kernel answers null, or unknown, for
   * one first), and told the call's collation last.
   */
  implement: <In extends ReadonlyArray<Schema.Top>, Out extends Schema.Top>(
    operator: Operator<In, Out>,
    run: (
      ...args: [...{ readonly [K in keyof In]: NonNullable<StoredOf<In[K]>> }, OperatorContext]
    ) => StoredOf<Out>,
  ): MemoryImplementation =>
    implementation(
      operator.descriptor,
      'strict',
      run as (...args: ReadonlyArray<unknown>) => unknown,
    ),

  /**
   * An implementation of an operator declared `nulls: 'own'`: given nulls
   * as they are, it answers for them; a predicate answers `null` for unknown.
   */
  implementHandlingNulls: <In extends ReadonlyArray<Schema.Top>, Out extends Schema.Top>(
    operator: Operator<In, Out>,
    run: (
      ...args: [...{ readonly [K in keyof In]: StoredOf<In[K]> }, OperatorContext]
    ) => StoredOf<Out> | null,
  ): MemoryImplementation =>
    implementation(operator.descriptor, 'own', run as (...args: ReadonlyArray<unknown>) => unknown),

  /** A table of implementations. One operator implemented twice, or two under one name, is refused. */
  memory: (...implementations: ReadonlyArray<MemoryImplementation>): MemoryOperators =>
    table(implementations, false),

  /** Both tables' implementations. An operator both implement is refused: say which wins with `override`. */
  merge: (left: MemoryOperators, right: MemoryOperators): MemoryOperators => {
    const both = right.implementations.filter(({ operator }) => left.has(operator))
    if (both.length > 0) {
      fail(
        `both tables implement ${both.map(({ operator }) => nameOf(operator)).join(', ')}; replace with Operators.override`,
      )
    }
    return table([...left.implementations, ...right.implementations], left.checked || right.checked)
  },

  /** The table with these implementations in place of its own for the same operators. */
  override: (
    base: MemoryOperators,
    ...implementations: ReadonlyArray<MemoryImplementation>
  ): MemoryOperators => {
    const replaced = new Set(implementations.map(({ operator }) => operator))
    return table(
      [
        ...base.implementations.filter(({ operator }) => !replaced.has(operator)),
        ...implementations,
      ],
      base.checked,
    )
  },

  /** Each operator the table implements, by name, with its declared claims. */
  describeTable: (base: MemoryOperators): ReadonlyArray<OperatorDescription> =>
    base.implementations.map(({ operator }) => described(operator)),

  /** An operator as JSON (`OperatorDescription`): its signature and claims, never its body. */
  describe: (operator: { readonly descriptor: OperatorDescriptor }): OperatorDescription =>
    described(operator.descriptor),

  /**
   * The table, checking every answer against its operator's output schema, so
   * an implementation that answers the wrong kind fails where it answered. For
   * tests: it costs a decode per call.
   */
  checked: (base: MemoryOperators): MemoryOperators => table(base.implementations, true),

  /**
   * A table implementing nothing: every memory interpreter's default. Like
   * every table it runs the kernel's own operators (`Text.startsWith`,
   * `Expr.add`, `Expr.sub`), which are metakit's operations, and refuses an
   * implementation of one.
   */
  kernel: kernelOperators,
}
