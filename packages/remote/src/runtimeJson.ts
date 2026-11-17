/**
 * The runtime fields of a Remote Model (the entity store, the ledgers) as JSON, and back.
 *
 * They hold values JSON cannot (a `Set` in every entity entry, `undefined`, `NaN`), so a
 * Model encoded as JSON, as Foldkit does to keep it across a dev reload and for devtools,
 * failed with "Expected JSON value" at the first entity. Each such value is written as a
 * tagged object and read back as what it was; plain data passes through unchanged.
 */
import { Option, Schema, SchemaTransformation } from 'effect'

/** The key a tagged value carries. An object that has it as its own key is wrapped too. */
const TAG = '~remote'

type Frozen = Schema.Json

const tagged = (kind: string, value?: Frozen): Frozen =>
  value === undefined ? { [TAG]: kind } : { [TAG]: kind, v: value }

const isPlain = (value: object): boolean => {
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

const freeze = (value: unknown, path: ReadonlyArray<string>): Frozen => {
  const at = (key: string) => [...path, key]
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value
  if (typeof value === 'number')
    return Number.isFinite(value) ? value : tagged('number', String(value))
  if (value === undefined) return tagged('undefined')
  if (typeof value === 'bigint') return tagged('bigint', String(value))
  if (value instanceof Date) return tagged('date', value.getTime())
  if (Option.isOption(value))
    return Option.isSome(value) ? tagged('some', freeze(value.value, at('value'))) : tagged('none')
  if (value instanceof Set)
    return tagged(
      'set',
      Array.from(value, (each, index) => freeze(each, at(String(index)))),
    )
  if (value instanceof Map)
    return tagged(
      'map',
      Array.from(value, ([key, each], index) => [
        freeze(key, at(`${index}.key`)),
        freeze(each, at(`${index}.value`)),
      ]),
    )
  if (Array.isArray(value)) return value.map((each, index) => freeze(each, at(String(index))))
  if (typeof value === 'object' && isPlain(value)) {
    const record: Record<string, Frozen> = {}
    for (const [key, each] of Object.entries(value)) record[key] = freeze(each, at(key))
    return Object.hasOwn(record, TAG) ? tagged('object', record) : record
  }
  throw new TypeError(
    `a Remote Model holds a ${typeof value === 'object' ? 'non-plain object' : typeof value} at ${path.join('.')}, which has no JSON form`,
  )
}

/**
 * Reads tagged JSON back. A value that is not JSON (a runtime Model handed to the schema as it is,
 * as embedding code and tests do) passes through as it came: only plain objects and arrays are
 * walked, and a Set, an Option or a class instance is left alone.
 */
const revive = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(revive)
  if (value === null || typeof value !== 'object' || !isPlain(value)) return value
  const record = value as Record<string, unknown>
  const kind = record[TAG]
  if (kind === undefined)
    return Object.fromEntries(Object.entries(record).map(([k, v]) => [k, revive(v)]))
  const inner = record['v']
  switch (kind) {
    case 'undefined':
      return undefined
    case 'number':
      return Number(inner)
    case 'bigint':
      return BigInt(inner as string)
    case 'date':
      return new Date(inner as number)
    case 'some':
      return Option.some(revive(inner))
    case 'none':
      return Option.none()
    case 'set':
      return new Set((inner as ReadonlyArray<unknown>).map(revive))
    case 'map':
      return new Map(
        (inner as ReadonlyArray<readonly [unknown, unknown]>).map(([k, v]) => [
          revive(k),
          revive(v),
        ]),
      )
    case 'object':
      return Object.fromEntries(
        Object.entries(inner as Record<string, unknown>).map(([k, v]) => [k, revive(v)]),
      )
    default:
      throw new TypeError(`a Remote Model was written with an unknown value kind "${String(kind)}"`)
  }
}

/**
 * A runtime value as the Model schema carries it: `unknown` in code, and tagged JSON once encoded.
 * Decoding also takes the runtime value itself, which it returns as it is.
 */
export const runtimeJson = Schema.Unknown.pipe(
  Schema.decodeTo(
    Schema.Unknown,
    SchemaTransformation.transform({
      decode: (stored: unknown) => revive(stored),
      encode: (value: unknown): unknown => freeze(value, []),
    }),
  ),
)
