/**
 * Binds named UI parts to capabilities the application already exposed.
 *
 * A part is an application id, a descriptive label, and the capability name
 * `Agent.expose` published. Discovery reads `messages.available` and the
 * encoded context; it does not read the DOM, run `authorize`, or dispatch.
 * Invocation resolves the part, then calls `messages.dispatchUnknown`, so
 * availability, decoding, authorization, and completion stay on that path.
 *
 * The label is not an identifier. Two renderings that share one are
 * `Ambiguous`. An occurrence id names one mount; a stale one matches nothing
 * and does not fall through to another row. A part with no mount is still
 * discoverable and invocable: mounting is not authority.
 */
import { Effect, Option, Schema } from 'effect'
import { defineTaggedUnion } from 'foldkit/schema'
import { type DispatchError, UnknownPartError } from './errors.js'
import type { DispatchResult, Invocation, MessageDescriptor } from './types.js'

/**
 * The runtime seams a part lookup uses. A full `AgentRuntime` satisfies this.
 * The functions do not read `model` or any other host field.
 */
export interface UiRuntime {
  readonly context: Effect.Effect<unknown>
  readonly messages: {
    readonly available: Effect.Effect<ReadonlyArray<Pick<MessageDescriptor, 'name'>>>
    readonly dispatchUnknown: (
      name: string,
      input: unknown,
      invocation?: Partial<Invocation>,
    ) => Effect.Effect<DispatchResult, DispatchError>
  }
}

/** One control the application chose to offer an agent. */
export interface UiPart {
  /** Stable application identity. A remount does not change it. */
  readonly id: string
  /** Accessible name, for a person to say. Not an authorization id. */
  readonly label: string
  /** Protocol name of a capability `Agent.expose` already published. */
  readonly capability: string
  /**
   * Fields of the encoded context this part shows. A name the context does
   * not have is omitted. Names the part does not list are omitted too.
   */
  readonly fields?: readonly string[] | undefined
}

/** One mounted rendering of a part. A new mount uses a new id. */
export interface UiOccurrence {
  /** `UiPart.id` this rendering belongs to. */
  readonly part: string
  /** Identity of this mount. Not an authorization id. */
  readonly id: string
}

/** The parts an application bound. Built with `Ui.catalog`. */
export interface UiCatalog {
  readonly parts: readonly UiPart[]
}

/** What a lookup is asking for. `mounted` is the renderings that exist now. */
export interface UiQuery {
  readonly mounted?: readonly UiOccurrence[] | undefined
  readonly id?: string | undefined
  readonly label?: string | undefined
  readonly occurrence?: string | undefined
}

const MatchFields = {
  id: Schema.String,
  label: Schema.String,
  capability: Schema.String,
  occurrence: Schema.Option(Schema.String),
  projection: Schema.Record(Schema.String, Schema.Unknown),
}

const MatchId = Schema.Struct({
  id: Schema.String,
  occurrence: Schema.Option(Schema.String),
})

/** A lookup: one rendering, several that share a label or a part, or nothing. */
export const UiDiscovery = defineTaggedUnion({
  Match: MatchFields,
  Ambiguous: {
    label: Schema.String,
    matches: Schema.Array(MatchId),
  },
  None: {},
})
export type UiDiscovery = typeof UiDiscovery.Type

const indexes = new WeakMap<UiCatalog, ReadonlyMap<string, UiPart>>()

const reservedField = (field: string): boolean =>
  field === '__proto__' || field === 'constructor' || field === 'prototype'

/** Copies the parts an application declared. Extra properties are not kept. */
export const catalog = (parts: readonly UiPart[]): UiCatalog => {
  const index = new Map<string, UiPart>()
  const copied: UiPart[] = []
  for (const part of parts) {
    if (part.id === '' || part.capability === '') {
      throw new Error('A part needs an id and a capability')
    }
    if (index.has(part.id)) throw new Error(`A part id is already bound: ${part.id}`)
    const reserved = part.fields?.find(reservedField)
    if (reserved !== undefined) throw new Error(`A part field name is reserved: ${reserved}`)
    const fields = part.fields === undefined ? undefined : [...part.fields]
    const next: UiPart = {
      id: part.id,
      label: part.label,
      capability: part.capability,
      ...(fields === undefined ? {} : { fields }),
    }
    index.set(part.id, next)
    copied.push(next)
  }
  const built: UiCatalog = { parts: copied }
  indexes.set(built, index)
  return built
}

const indexOf = (catalog: UiCatalog): ReadonlyMap<string, UiPart> => {
  const index = indexes.get(catalog)
  if (index === undefined) throw new Error('Build a part catalog with Ui.catalog')
  return index
}

interface Rendering {
  readonly part: UiPart
  readonly occurrence: Option.Option<string>
}

/**
 * Renderings of one part. A requested occurrence that is not mounted is
 * `undefined`: the caller asked for a rendering that is gone, and another
 * row must not answer for it.
 */
const renderingsOf = (
  part: UiPart,
  mounted: readonly UiOccurrence[],
  occurrence: string | undefined,
): readonly Rendering[] | undefined => {
  const hits: Rendering[] = []
  for (const item of mounted) {
    if (item.part !== part.id) continue
    if (occurrence !== undefined && item.id !== occurrence) continue
    hits.push({ part, occurrence: Option.some(item.id) })
  }
  if (occurrence !== undefined) return hits.length === 0 ? undefined : hits
  if (hits.length === 0) return [{ part, occurrence: Option.none() }]
  return hits
}

const projectionOf = (part: UiPart, encoded: unknown): Record<string, unknown> => {
  const out: Record<string, unknown> = {}
  const fields = part.fields
  if (
    fields === undefined ||
    encoded === null ||
    typeof encoded !== 'object' ||
    Array.isArray(encoded)
  ) {
    return out
  }
  for (const field of fields) {
    if (Object.hasOwn(encoded, field)) out[field] = (encoded as Record<string, unknown>)[field]
  }
  return out
}

/** Finds the rendering a person named. Does not dispatch and does not read the DOM. */
export const discover = (
  runtime: UiRuntime,
  catalog: UiCatalog,
  query: UiQuery,
): Effect.Effect<UiDiscovery> =>
  Effect.gen(function* () {
    if (query.id === undefined && query.label === undefined) {
      return yield* Effect.die(new Error('Discovery names a part id or a label'))
    }
    if (query.occurrence !== undefined && query.id === undefined) {
      return yield* Effect.die(new Error('Discovery addresses an occurrence by its part id'))
    }
    indexOf(catalog)
    const encoded = yield* runtime.context
    const offered = yield* runtime.messages.available
    const names = new Set<string>()
    for (const descriptor of offered) names.add(descriptor.name)
    const mounted = query.mounted ?? []
    const candidates: Rendering[] = []
    for (const part of catalog.parts) {
      if (!names.has(part.capability)) continue
      if (query.id !== undefined && part.id !== query.id) continue
      if (query.label !== undefined && part.label !== query.label) continue
      const found = renderingsOf(part, mounted, query.occurrence)
      if (found === undefined) continue
      for (const rendering of found) candidates.push(rendering)
    }
    if (candidates.length === 0) return UiDiscovery.None()
    if (candidates.length > 1) {
      return UiDiscovery.Ambiguous({
        label: query.label ?? candidates[0]!.part.label,
        matches: candidates.map(rendering => ({
          id: rendering.part.id,
          occurrence: rendering.occurrence,
        })),
      })
    }
    const only = candidates[0]!
    return UiDiscovery.Match({
      id: only.part.id,
      label: only.part.label,
      capability: only.part.capability,
      occurrence: only.occurrence,
      projection: projectionOf(only.part, encoded),
    })
  })

/**
 * Dispatches the capability bound to `id`.
 *
 * An id the catalog does not bind fails before dispatch, including when a
 * capability of that name exists. `dispatchUnknown` then applies the same
 * checks as any other caller.
 */
export const invoke = (
  runtime: UiRuntime,
  catalog: UiCatalog,
  id: string,
  input: unknown,
  invocation?: Partial<Invocation>,
): Effect.Effect<DispatchResult, DispatchError | UnknownPartError> => {
  const part = indexOf(catalog).get(id)
  if (part === undefined) return Effect.fail(UnknownPartError.of(id))
  return runtime.messages.dispatchUnknown(part.capability, input, invocation)
}

/** The part catalog, its lookup, and its dispatch. */
export const Ui = { catalog, discover, invoke }
