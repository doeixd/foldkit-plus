/**
 * Reading a partly known environment, for the readers of one
 * (`residualizeNode`, `judgeNode`): a value is known only where the
 * environment holds it whole.
 */
import { Option, SchemaAST } from 'effect'
import * as Path from '../path.js'
import { normalizeRead } from './eval.js'
import { present } from './kind.js'

const isPlainObject = (value: unknown): value is Readonly<Record<string, unknown>> => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const proto: unknown = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

const structWhole = (
  value: Readonly<Record<string, unknown>>,
  struct: SchemaAST.Objects,
): boolean =>
  struct.propertySignatures.every(property => {
    if (typeof property.name !== 'string') return false
    const held = Object.hasOwn(value, property.name) ? value[property.name] : undefined
    return held !== undefined && isWhole(held, Option.some(property.type))
  })

const narrowsToVariant = (
  value: Readonly<Record<string, unknown>>,
  structs: ReadonlyArray<SchemaAST.Objects>,
): Option.Option<SchemaAST.Objects> => {
  const compatible = structs.filter(struct =>
    struct.propertySignatures.every(property => {
      if (typeof property.name !== 'string') return true
      if (!SchemaAST.isLiteral(property.type)) return true
      if (!Object.hasOwn(value, property.name)) return true
      return value[property.name] === property.type.literal
    }),
  )
  if (compatible.length !== 1) return Option.none()
  const only = compatible[0]!
  const pinnedByLiteral = only.propertySignatures.some(
    property =>
      typeof property.name === 'string' &&
      SchemaAST.isLiteral(property.type) &&
      Object.hasOwn(value, property.name) &&
      value[property.name] === property.type.literal,
  )
  return pinnedByLiteral ? Option.some(only) : Option.none()
}

/**
 * Whether `value` is all of what `ast` describes. A partial environment may
 * hold some of a struct's fields, so a plain object is whole only against a
 * struct Schema (or a tagged-union variant pinned by its literal tag) whose
 * every declared key it holds. A missing optional key still leaves the read
 * open to a completion that supplies it.
 */
const isWhole = (value: unknown, ast: Option.Option<SchemaAST.AST>): boolean => {
  if (!isPlainObject(value)) return true
  if (Option.isNone(ast)) return false
  const structs = present(ast.value).filter(SchemaAST.isObjects)
  if (structs.length === 1) return structWhole(value, structs[0]!)
  if (structs.length > 1) {
    return Option.exists(narrowsToVariant(value, structs), struct => structWhole(value, struct))
  }
  return false
}

/**
 * The value `partial` holds at `segments`, where it holds it whole; `raw`
 * takes what is held as it is, for a value no Schema describes (the related
 * rows under a row, `{ rows, whole }`, which says itself whether it is all).
 */
export const lookupPartial = (
  partial: unknown,
  segments: ReadonlyArray<string>,
  ast: Option.Option<SchemaAST.AST>,
  raw = false,
): Option.Option<unknown> => {
  let current: unknown = partial
  for (const segment of segments) {
    current = Path.readable(current)
    // A none is a value: what is read through it is null.
    if (current === null) return Option.some(null)
    if (current === undefined || typeof current !== 'object' || !Object.hasOwn(current, segment)) {
      return Option.none()
    }
    const next = (current as Record<string, unknown>)[segment]
    if (next === undefined) return Option.none()
    current = next
  }
  current = Path.readable(current)
  if (current === undefined) return Option.none()
  return raw || isWhole(current, ast) ? Option.some(normalizeRead(current)) : Option.none()
}
