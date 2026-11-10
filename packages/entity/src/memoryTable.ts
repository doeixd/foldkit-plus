/**
 * The in-memory operator table and the kernel's own operators. Apart from
 * `Operators` so evaluating a body keeps none of what describes an operator.
 */
import { Option } from 'effect'
import { Collation } from './collation.js'
import type { OperatorDescriptor } from './expr.js'
import type {
  Evidence,
  MemoryImplementation,
  MemoryOperators,
  OperatorContext,
} from './operators.js'
import { Text } from './text.js'

/** An operator by its id, and its version when that is not the first. */
export const nameOf = (operator: OperatorDescriptor): string =>
  operator.version === 1 ? operator.id : `${operator.id}@${operator.version}`

export const fail = (what: string): never => {
  throw new Error(`[foldkit-entity] Operators: ${what}`)
}

export const table = (
  implementations: ReadonlyArray<MemoryImplementation>,
  checked: boolean,
  evidence: ReadonlyArray<Evidence>,
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
    versions: (id: string) =>
      implementations
        .filter(({ operator }) => operator.id === id)
        .map(({ operator }) => operator.version),
    get: (operator: OperatorDescriptor) => Option.fromUndefinedOr(byOperator.get(operator)),
    named: (name: string) => Option.fromUndefinedOr(byName.get(name)),
    checked,
    implementations: Object.freeze([...implementations]),
    evidence: Object.freeze([...evidence]),
  })
}

/** An implementation, its operator's null rule checked against the function chosen for it. */
export const implementation = (
  operator: OperatorDescriptor,
  nulls: OperatorDescriptor['nulls'],
  run: (...args: ReadonlyArray<unknown>) => unknown,
): MemoryImplementation => {
  // SQL compiles what a defined operator means, so an implementation here would
  // be a second meaning that only memory runs.
  if (Option.isSome(operator.definedAs)) {
    fail(
      `${nameOf(operator)} is defined by an expression, which every interpreter runs; it takes no implementation`,
    )
  }
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

const REPLACEMENT = String.fromCharCode(0xfffd)

/**
 * Text's characters as a database holds them: a lone surrogate, which UTF-8
 * cannot encode, as U+FFFD, which SQLite's and Postgres's drivers send instead.
 */
const charactersOf = (text: string): ReadonlyArray<string> =>
  Array.from(text, each => {
    const code = each.codePointAt(0)!
    return code >= 0xd800 && code <= 0xdfff ? REPLACEMENT : each
  })

/**
 * Whether `text` begins with `prefix` by character, as SQL's `substr` and
 * `left` count: `String.prototype.startsWith` compares UTF-16 units, so half
 * of an astral character would begin the text that holds all of it.
 */
const beginsWith = (text: string, prefix: string): boolean => {
  const [characters, start] = [charactersOf(text), charactersOf(prefix)]
  return start.length <= characters.length && start.every((each, i) => each === characters[i])
}

const startsWith = implementation(Text.startsWith.descriptor, 'strict', (...given) => {
  const [text, prefix, { collation }] = given as [string, string, OperatorContext]
  const folded = Option.exists(collation, each => each._tag === 'AsciiFold')
  return folded
    ? beginsWith(Collation.foldAscii(text), Collation.foldAscii(prefix))
    : beginsWith(text, prefix)
})

/** The kernel's own operators (`Text.startsWith`): every memory interpreter's default. */
export const kernelOperators = table([startsWith], false, [])
