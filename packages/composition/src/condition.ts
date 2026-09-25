/**
 * Conditions: when a node shows, over the page's **context**.
 *
 * Context is a Schema the Catalog declares (an audience, a locale, a feature
 * flag), and the application supplies its values when it draws a page. A
 * node's `when` is a list of Conditions, all of which must hold. It is a small
 * stored IR, not `foldkit-entity`'s `Expr` itself, because an `Expr` is built
 * in code and a Condition is stored; it follows `Expr`'s meaning on purpose:
 * `eq`, `isNull`, `isNotNull`, and `contains`, which is case-insensitive with
 * ASCII-only folding, and in which absent text contains nothing.
 *
 * `when` is presentation, not authorization: a hidden node is still in the
 * Document anyone who can fetch the page receives.
 */
import { Result, Schema } from 'effect'

const Key = Schema.String
const Scalar = Schema.Union([Schema.String, Schema.Number, Schema.Boolean])

export const Condition = Schema.Union([
  Schema.Struct({ eq: Schema.Tuple([Key, Scalar]) }),
  Schema.Struct({ isNull: Key }),
  Schema.Struct({ isNotNull: Key }),
  Schema.Struct({ contains: Schema.Tuple([Key, Schema.String]) }),
])
export type Condition = typeof Condition.Type

/** A node's `when`: every Condition must hold. */
export const When = Schema.Array(Condition)
export type When = typeof When.Type

/** Something wrong with a node's `when`, at a path inside the node. */
export interface ConditionFinding {
  readonly code: 'composition:invalid-condition' | 'composition:unknown-context'
  readonly path: ReadonlyArray<string | number>
  readonly message: string
}

const decodeWhen = Schema.decodeUnknownResult(When)

const keyOf = (condition: Condition): string =>
  'eq' in condition
    ? condition.eq[0]
    : 'contains' in condition
      ? condition.contains[0]
      : 'isNull' in condition
        ? condition.isNull
        : condition.isNotNull

/** The fields a context Schema declares, when it is a struct. */
const fieldsOf = (context: Schema.Top | undefined): Readonly<Record<string, Schema.Top>> => {
  const fields = (context as { readonly fields?: unknown } | undefined)?.fields
  return typeof fields === 'object' && fields !== null
    ? (fields as Readonly<Record<string, Schema.Top>>)
    : {}
}

/** What is wrong with a stored `when`, against the context a Catalog declares. */
export const check = (
  context: Schema.Top | undefined,
  when: unknown,
): ReadonlyArray<ConditionFinding> => {
  if (when === undefined) return []
  const decoded = decodeWhen(when)
  if (Result.isFailure(decoded))
    return [
      {
        code: 'composition:invalid-condition',
        path: ['when'],
        message: `is not a list of conditions: ${decoded.failure.message}`,
      },
    ]
  const fields = fieldsOf(context)
  return decoded.success.flatMap((condition, index): ReadonlyArray<ConditionFinding> => {
    const key = keyOf(condition)
    const field = fields[key]
    const path = ['when', index]
    if (field === undefined)
      return [
        {
          code: 'composition:unknown-context',
          path,
          message: `"${key}" is not in the page's context`,
        },
      ]
    const value = 'eq' in condition ? condition.eq[1] : undefined
    if (
      value !== undefined &&
      Result.isFailure(Schema.decodeUnknownResult(field as Schema.Codec<unknown, unknown>)(value))
    )
      return [
        {
          code: 'composition:unknown-context',
          path,
          message: `${JSON.stringify(value)} is not a value "${key}" can have`,
        },
      ]
    return []
  })
}

// ASCII-only, as `Expr.contains` folds.
const fold = (text: string) => text.replace(/[A-Z]/g, letter => letter.toLowerCase())

const holdsOne = (condition: Condition, context: Readonly<Record<string, unknown>>): boolean => {
  if ('eq' in condition) return context[condition.eq[0]] === condition.eq[1]
  if ('isNull' in condition) return context[condition.isNull] == null
  if ('isNotNull' in condition) return context[condition.isNotNull] != null
  const text = context[condition.contains[0]]
  return typeof text === 'string' && fold(text).includes(fold(condition.contains[1]))
}

/**
 * Whether a stored `when` holds in a context. No `when` always holds. With no
 * context, or a `when` that is not a list of conditions, a node that has
 * conditions does not show: a page drawn without its context fails closed.
 */
export const holds = (
  when: unknown,
  context: Readonly<Record<string, unknown>> | undefined,
): boolean => {
  if (when === undefined) return true
  const decoded = decodeWhen(when)
  if (Result.isFailure(decoded)) return false
  if (decoded.success.length === 0) return true
  return context !== undefined && decoded.success.every(each => holdsOne(each, context))
}

/** Conditions to store: `Composition.when.eq('audience', 'member')`. */
export const when = {
  eq: (key: string, value: string | number | boolean): Condition => ({ eq: [key, value] }),
  isNull: (key: string): Condition => ({ isNull: key }),
  isNotNull: (key: string): Condition => ({ isNotNull: key }),
  contains: (key: string, text: string): Condition => ({ contains: [key, text] }),
}
