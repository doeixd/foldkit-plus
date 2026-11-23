import { Data, Schema } from 'effect'
import type { DependencyTree, Projection } from './index.js'
import { hasTagIn, messageTags } from './messageTags.js'

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
      readonly set?: ((root: Root, value: Value) => Root) | undefined
    }

/** Top-level Model fields a projection owns whole (`path.length === 1`) vs partially (`path.length > 1`). */
export interface OwnedFields {
  readonly whole: ReadonlySet<string>
  readonly partial: ReadonlySet<string>
}

const ownedBy = new WeakMap<DependencyTree, OwnedFields>()
const equivalenceOf = new WeakMap<object, (a: never, b: never) => boolean>()

/**
 * Partition the top-level Model fields touched by `dependencies` into `whole`
 * (owned outright by a single-segment path) and `partial` (only sub-paths are
 * owned). Used by both `Closure.reads` and `foldkit-sync` so both agree on
 * which top-level fields are wholly owned.
 */
export const ownedFields = (dependencies: DependencyTree): OwnedFields => {
  let fields = ownedBy.get(dependencies)
  if (fields === undefined) {
    const whole = new Set<string>()
    const partial = new Set<string>()
    for (const path of dependencies) {
      const head = path[0]
      if (head === undefined) continue
      if (path.length === 1) {
        whole.add(head)
        partial.delete(head)
      } else if (!whole.has(head)) {
        partial.add(head)
      }
    }
    fields = { whole, partial }
    ownedBy.set(dependencies, fields)
  }
  return fields
}

const partsOf = <Root, Value>(
  projection: ClosureProjection<Root, Value>,
): {
  readonly codec: Schema.Schema<Value>
  readonly read: (root: Root) => Value
  readonly set?: ((root: Root, value: Value) => Root) | undefined
} =>
  'schema' in projection
    ? { codec: projection.schema, read: projection.get, set: projection.set }
    : { codec: projection.Model, read: projection.read }

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
  const { whole, partial } = ownedFields(projection.dependencies)
  const { codec, read, set } = partsOf(projection)
  const outside = Object.keys(live).filter(
    key =>
      !whole.has(key) &&
      (set !== undefined || !partial.has(key)) &&
      !Object.is(live[key], baseline[key]),
  )
  if (outside.length === 0) return []

  const equal = equivalence(codec)
  const current = read(model)
  const after = read(app.update(model, message).model)
  const differs = (fields: ReadonlyArray<string>): boolean => {
    const reset = { ...live }
    let touchedPartial = false
    for (const key of fields) {
      reset[key] = baseline[key]
      if (partial.has(key)) touchedPartial = true
    }
    const candidate =
      touchedPartial && set !== undefined ? set(reset as Root, current) : (reset as Root)
    const other = read(app.update(candidate, message).model)
    return !Object.is(after, other) && !equal(after, other)
  }

  if (!differs(outside)) return []
  if (outside.length === 1) return outside
  const named = outside.filter(key => differs([key]))
  // When each of several fields is enough alone, resetting one changes nothing: all are named.
  return named.length === 0 ? outside : named
}

/**
 * A closed Surface a step broke: `Reads` names the fields outside it that a Message in its
 * set read, `Outside` says a Message outside its set moved it.
 */
export type ClosureViolation = Data.TaggedEnum<{
  Reads: { readonly surface: string; readonly fields: ReadonlyArray<string> }
  Outside: { readonly surface: string }
}>
export const ClosureViolation = Data.taggedEnum<ClosureViolation>()

/** The Surfaces a closure check takes: those declared `closed: true` are tested. */
export type ClosedSurfaces<Root> = ReadonlyArray<{
  readonly name: string
  readonly closed: boolean
  readonly messages: readonly unknown[]
  /** Read only to refuse a Surface with params. */
  readonly Params: unknown
  /** `never`: whatever params a Surface takes, it is only ever called with none. */
  readonly projection: (params: never) => Projection<Root, unknown>
}>

interface Closed<Root> {
  readonly name: string
  readonly projection: ClosureProjection<Root, unknown>
  readonly tags: ReadonlySet<string>
}

const closedOf = <Root>(
  surfaces: ClosedSurfaces<Root>,
  caller: string,
): ReadonlyArray<Closed<Root>> =>
  surfaces
    .filter(surface => surface.closed)
    .map(surface => {
      if (surface.Params !== undefined) {
        throw new Error(`${caller}: Surface "${surface.name}" declares params`)
      }
      // No params schema, checked above: the Surface takes none.
      const projection: ClosureProjection<Root, unknown> = surface.projection(undefined as never)
      return { name: surface.name, projection, tags: new Set(messageTags(surface)) }
    })

const moved = <Root>(
  { name, projection }: Closed<Root>,
  before: Root,
  after: Root,
): ReadonlyArray<ClosureViolation> => {
  const { codec, read } = partsOf(projection)
  const [was, now] = [read(before), read(after)]
  return Object.is(was, now) || equivalence(codec)(was, now)
    ? []
    : [ClosureViolation.Outside({ surface: name })]
}

/**
 * A step check over the Surfaces declared `closed: true`, for a walk. For a Message in a
 * Surface's `messages`, `Closure.reads` must be empty; for any other Message the projection
 * must not change from `before` to `after`. A Surface not declared closed is never tested.
 * A Surface with params is refused here: it has no one projection to test.
 */
const violations = <Root, Message>(
  app: {
    readonly initial: Root
    readonly update: (model: Root, message: Message) => { readonly model: Root }
  },
  surfaces: ClosedSurfaces<Root>,
): ((before: Root, message: Message, after: Root) => ReadonlyArray<ClosureViolation>) => {
  const closed = closedOf(surfaces, 'Closure.violations')
  return (before, message, after) =>
    closed.flatMap((surface): ReadonlyArray<ClosureViolation> => {
      // tag-check: open, `Message` is the application's own, which this cannot name
      if (hasTagIn(surface.tags, message)) {
        const fields = reads(app, surface.projection, before, message)
        return fields.length === 0
          ? []
          : [ClosureViolation.Reads({ surface: surface.name, fields })]
      }
      return moved(surface, before, after)
    })
}

/** The `Outside` half of `violations`, which runs no `update` (`WritesCheck.verify`); not on `Closure`, so a page reading it does not carry it. */
export const movedOutside = <Root, Message>(
  surfaces: ClosedSurfaces<Root>,
): ((before: Root, message: Message, after: Root) => ReadonlyArray<ClosureViolation>) => {
  const closed = closedOf(surfaces, 'WritesCheck.verify')
  return (before, message, after) =>
    closed.flatMap(surface =>
      // tag-check: open, `Message` is the application's own, which this cannot name
      hasTagIn(surface.tags, message) ? [] : moved(surface, before, after),
    )
}

/** Checks that a projection is closed under `update`: `Closure.reads` names what it still depends on. */
export const Closure = { reads, violations }
