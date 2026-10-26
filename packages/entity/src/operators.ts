/**
 * How the in-memory interpreter runs primitive operators: a table of
 * implementations, passed to `evaluate` and every judge as a value. A table is
 * immutable and implements each operator once; nothing registers anything
 * globally. See `docs/design/expr-operations-DESIGN.md` §5.4.
 */
import { Option, type Schema } from 'effect'
import { Collation } from './collation.js'
import type { Operator, OperatorDescriptor, OperatorTable } from './expr.js'
import { Text } from './text.js'

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

/** The in-memory interpreter's implementations, by operator. */
export interface MemoryOperators extends OperatorTable {
  readonly _tag: 'MemoryOperators'
  readonly get: (operator: OperatorDescriptor) => Option.Option<MemoryImplementation['run']>
  /** Whether each answer is checked against its operator's output schema: for tests. */
  readonly checked: boolean
  readonly implementations: ReadonlyArray<MemoryImplementation>
}

type StoredOf<S extends Schema.Top> = Schema.Codec.Encoded<S>

/** An operator by its id, and its version when that is not the first. */
const nameOf = (operator: OperatorDescriptor): string =>
  operator.version === 1 ? operator.id : `${operator.id}@${operator.version}`

const fail = (what: string): never => {
  throw new Error(`[foldkit-entity] Operators: ${what}`)
}

const table = (
  implementations: ReadonlyArray<MemoryImplementation>,
  checked: boolean,
): MemoryOperators => {
  const byOperator = new Map<OperatorDescriptor, MemoryImplementation['run']>()
  const byName = new Map<string, OperatorDescriptor>()
  for (const { operator, run } of implementations) {
    if (byOperator.has(operator)) {
      fail(`${nameOf(operator)} is implemented twice; replace one with Operators.override`)
    }
    // Two descriptors under one name would leave a body's call ambiguous.
    const named = byName.get(nameOf(operator))
    if (named !== undefined && named !== operator) {
      fail(`two operators are named ${nameOf(operator)}; give one another id or version`)
    }
    byName.set(nameOf(operator), operator)
    byOperator.set(operator, run)
  }
  return Object.freeze({
    _tag: 'MemoryOperators',
    has: (operator: OperatorDescriptor) => byOperator.has(operator),
    get: (operator: OperatorDescriptor) => Option.fromUndefinedOr(byOperator.get(operator)),
    checked,
    implementations: Object.freeze([...implementations]),
  })
}

/** An implementation, its operator's null rule checked against the function chosen for it. */
const implementation = (
  operator: OperatorDescriptor,
  nulls: OperatorDescriptor['nulls'],
  run: (...args: ReadonlyArray<unknown>) => unknown,
): MemoryImplementation => {
  if (operator.nulls !== nulls) {
    fail(
      nulls === 'strict'
        ? `${nameOf(operator)} handles null itself; implement it with Operators.implementHandlingNulls`
        : `${nameOf(operator)} is strict about null; implement it with Operators.implement`,
    )
  }
  return Object.freeze({
    operator,
    run: (args: ReadonlyArray<unknown>, context: OperatorContext) => run(...args, context),
  })
}

const startsWith = implementation(Text.startsWith.descriptor, 'strict', (...given) => {
  const [text, prefix, { collation }] = given as [string, string, OperatorContext]
  const folded = Option.exists(collation, each => each._tag === 'AsciiFold')
  return folded
    ? Collation.foldAscii(text).startsWith(Collation.foldAscii(prefix))
    : text.startsWith(prefix)
})

export const Operators = {
  /**
   * An implementation of a strict operator: a pure function of its arguments'
   * stored values, never given a null (the kernel answers null, or unknown, for
   * one first), and told the call's collation last.
   *
   * ```ts
   * Operators.implement(startsWith, (text, prefix, { collation }) => text.startsWith(prefix))
   * ```
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
   * An implementation of an operator declared `nulls: 'handled'`: given nulls
   * as they are, it answers for them; a predicate answers `null` for unknown.
   */
  implementHandlingNulls: <In extends ReadonlyArray<Schema.Top>, Out extends Schema.Top>(
    operator: Operator<In, Out>,
    run: (
      ...args: [...{ readonly [K in keyof In]: StoredOf<In[K]> }, OperatorContext]
    ) => StoredOf<Out> | null,
  ): MemoryImplementation =>
    implementation(
      operator.descriptor,
      'handled',
      run as (...args: ReadonlyArray<unknown>) => unknown,
    ),

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

  /**
   * The table, checking every answer against its operator's output schema, so
   * an implementation that answers the wrong kind fails where it answered. For
   * tests: it costs a decode per call.
   */
  checked: (base: MemoryOperators): MemoryOperators => table(base.implementations, true),

  /** The kernel's own operators (`Text.startsWith`): every memory interpreter's default. */
  kernel: table([startsWith], false),
}
