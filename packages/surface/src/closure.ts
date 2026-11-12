import { Schema } from 'effect'
import type { DependencyTree } from './index.js'

/** A read-only `Projection` or a `WritableProjection`: `Closure` needs only the codec, the paths and the read. */
export type ClosureProjection<Root, Value> =
  | {
      readonly Model: Schema.Schema<Value>
      readonly dependencies: DependencyTree
      readonly read: (root: Root) => Value
    }
  | {
      readonly schema: Schema.Schema<Value>
      readonly dependencies: DependencyTree
      readonly get: (root: Root) => Value
    }

const ownedBy = new WeakMap<DependencyTree, ReadonlySet<string>>()
const equivalenceOf = new WeakMap<object, (a: never, b: never) => boolean>()

const owned = (dependencies: DependencyTree): ReadonlySet<string> => {
  let fields = ownedBy.get(dependencies)
  if (fields === undefined) {
    fields = new Set(dependencies.map(path => path[0]).filter(key => key !== undefined))
    ownedBy.set(dependencies, fields)
  }
  return fields
}

const equivalence = <Value>(codec: Schema.Schema<Value>): ((a: Value, b: Value) => boolean) => {
  let equal = equivalenceOf.get(codec)
  if (equal === undefined) {
    equal = Schema.toEquivalence(codec) as never
    equivalenceOf.set(codec, equal)
  }
  return equal as (a: Value, b: Value) => boolean
}

/**
 * The top-level Model fields outside `projection` that its value after `message` depends on;
 * empty when the projection is closed for this step. `update` runs on `model` and on `model`
 * with those fields reset to `app.initial`, and the two projections are compared with the
 * projection's codec. Only a field that differs from `initial` can be named, and a field that
 * holds the projection's own paths (even in part) is never one.
 *
 * It runs `update` again and so does what `update` does: no Command it returns is run.
 */
const reads = <Root, Value, Message>(
  app: {
    readonly initial: Root
    readonly update: (model: Root, message: Message) => { readonly model: Root }
  },
  projection: ClosureProjection<Root, Value>,
  model: Root,
  message: Message,
): ReadonlyArray<string> => {
  const live = model as Readonly<Record<string, unknown>>
  const baseline = app.initial as Readonly<Record<string, unknown>>
  const own = owned(projection.dependencies)
  const outside = Object.keys(live).filter(
    key => !own.has(key) && !Object.is(live[key], baseline[key]),
  )
  if (outside.length === 0) return []

  const codec = 'schema' in projection ? projection.schema : projection.Model
  const read = 'get' in projection ? projection.get : projection.read
  const equal = equivalence(codec)
  const after = read(app.update(model, message).model)
  const differs = (fields: ReadonlyArray<string>): boolean => {
    const reset = { ...live }
    for (const key of fields) reset[key] = baseline[key]
    const other = read(app.update(reset as Root, message).model)
    return !Object.is(after, other) && !equal(after, other)
  }

  if (!differs(outside)) return []
  if (outside.length === 1) return outside
  const named = outside.filter(key => differs([key]))
  // When each of several fields is enough alone, resetting one changes nothing: all are named.
  return named.length === 0 ? outside : named
}

/** Checks that a projection is closed under `update`: `Closure.reads` names what it still depends on. */
export const Closure = { reads }
