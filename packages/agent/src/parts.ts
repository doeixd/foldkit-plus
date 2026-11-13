/**
 * A typed alias table from a control's id and label to a capability
 * `Agent.expose` already published.
 *
 * Discovery reads `messages.available` and the encoded context; it does not
 * read the DOM, run `authorize`, or dispatch. Invocation resolves the part,
 * then calls `messages.dispatchUnknown`, so availability, decoding,
 * authorization, and completion stay on that path.
 *
 * The label is not an identifier. Two renderings that share one are
 * `Ambiguous`. An occurrence id names one mount; a stale one matches nothing
 * and does not fall through to another row. A part with no mount is still
 * discoverable and invocable: mounting is not authority.
 */
import { Effect, Option, Schema, SchemaAST } from 'effect'
import { defineTaggedUnion } from 'foldkit/schema'
import { type DispatchError, UnknownPartError } from './errors.js'
import type { Definition } from './make.js'
import type { DispatchResult, Invocation, MessageDescriptor } from './types.js'

/**
 * The runtime seams a part lookup uses. A full `AgentRuntime` satisfies this.
 * `definition` is compared with the catalog's, so a catalog cannot resolve
 * its names against another application's capabilities.
 */
export interface UiRuntime {
  readonly definition: unknown
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

/** One control the application offers an agent, as `Ui.catalog` declares it. */
export interface UiPartSpec<Tag extends string, Field extends string> {
  /** Stable application identity. A remount does not change it. */
  readonly id: string
  /** Accessible name, for a person to say. Not an authorization id. */
  readonly label: string
  /** The exposed Message's constructor. */
  readonly capability: (...args: never) => { readonly _tag: Tag }
  /** Fields of the encoded context this part shows. */
  readonly fields?: ReadonlyArray<Field> | undefined
}

/** A declared part with its capability resolved to the protocol name. */
export interface UiPart<Id extends string = string> {
  readonly id: Id
  readonly label: string
  readonly capability: string
  readonly fields: ReadonlyArray<string>
}

/** One mounted rendering of a part. A new mount uses a new id. */
export interface UiOccurrence<Id extends string = string> {
  /** `UiPart.id` this rendering belongs to. */
  readonly part: Id
  /** Identity of this mount. Not an authorization id. */
  readonly id: string
}

// Set by the class's static block: only this module makes or reads a catalog.
let makeCatalog: <Id extends string>(
  parts: ReadonlyMap<string, UiPart<Id>>,
  definition: unknown,
) => UiCatalog<Id>
let partsOf: (catalog: UiCatalog) => ReadonlyMap<string, UiPart>
let definitionOf: (catalog: UiCatalog) => unknown

/** The parts an application bound. Only `Ui.catalog` makes one. */
class UiCatalog<Id extends string = string> {
  readonly #parts: ReadonlyMap<string, UiPart<Id>>
  readonly #definition: unknown

  static {
    makeCatalog = (parts, definition) => new UiCatalog(parts, definition)
    partsOf = catalog => catalog.#parts
    definitionOf = catalog => catalog.#definition
  }

  private constructor(parts: ReadonlyMap<string, UiPart<Id>>, definition: unknown) {
    this.#parts = parts
    this.#definition = definition
  }

  /**
   * The declared part, so a view draws the label an agent hears. Throws for
   * an undeclared id, which literal ids rule out at compile time.
   */
  part(id: Id): UiPart<Id> {
    const found = this.#parts.get(id)
    if (found === undefined) throw new Error(`No such part: ${id}`)
    return found
  }
}
export type { UiCatalog }

/**
 * What an agent asks for: a part by id, one mounted rendering of a part, or
 * every part a label names. Decode an agent's JSON with this Schema.
 */
export const UiQuery = defineTaggedUnion({
  Part: { id: Schema.String },
  Occurrence: { part: Schema.String, id: Schema.String },
  Label: { label: Schema.String },
})
export type UiQuery = typeof UiQuery.Type

/** A lookup: one rendering, several that share a label or a part, or nothing. */
export const UiDiscovery = defineTaggedUnion({
  Match: {
    id: Schema.String,
    label: Schema.String,
    capability: Schema.String,
    occurrence: Schema.OptionFromNullOr(Schema.String),
    projection: Schema.Record(Schema.String, Schema.Unknown),
  },
  Ambiguous: {
    label: Schema.String,
    matches: Schema.Array(
      Schema.Struct({ id: Schema.String, occurrence: Schema.OptionFromNullOr(Schema.String) }),
    ),
  },
  None: {},
})
export type UiDiscovery = typeof UiDiscovery.Type

/** The encoded context's field names, or none when it is not a struct. */
const contextFields = (definition: Pick<Definition, 'context'>): ReadonlySet<string> => {
  if (definition.context === undefined) return new Set()
  const encoded = SchemaAST.toEncoded(definition.context.Model.ast)
  if (!SchemaAST.isObjects(encoded)) return new Set()
  return new Set(encoded.propertySignatures.map(signature => String(signature.name)))
}

/**
 * Resolves each part against `definition`. An id bound twice, an empty label,
 * a capability the definition does not expose, or a field its encoded context
 * lacks throws here, never at discovery.
 */
export const catalog = <
  Context_,
  ByTag,
  const Parts extends ReadonlyArray<UiPartSpec<keyof ByTag & string, keyof Context_ & string>>,
>(
  definition: Definition<any, Context_, any, any, ByTag>,
  parts: Parts,
): UiCatalog<Parts[number]['id']> => {
  const names = new Map<unknown, string>()
  for (const variant of definition.messages.variants) {
    names.set(variant.messageConstructor, variant.name)
  }
  const fields = contextFields(definition)
  const index = new Map<string, UiPart<Parts[number]['id']>>()
  for (const part of parts) {
    if (part.id === '') throw new Error('A part needs an id')
    if (part.label === '') throw new Error(`Part ${part.id} needs a label`)
    if (index.has(part.id)) throw new Error(`A part id is already bound: ${part.id}`)
    const capability = names.get(part.capability)
    if (capability === undefined) {
      throw new Error(`Part ${part.id} names a capability this definition does not expose`)
    }
    const shown = [...(part.fields ?? [])]
    const missing = shown.find(field => !fields.has(field))
    if (missing !== undefined) {
      throw new Error(`Part ${part.id} shows ${missing}, which the encoded context lacks`)
    }
    index.set(part.id, { id: part.id, label: part.label, capability, fields: shown })
  }
  return makeCatalog(index, definition)
}

/** Refuses a runtime bound to another definition: a wiring mistake, so a defect. */
const sameDefinition = (runtime: UiRuntime, catalog: UiCatalog): Effect.Effect<void> =>
  runtime.definition === definitionOf(catalog)
    ? Effect.void
    : Effect.die(new Error('This part catalog was built for another definition'))

interface Rendering {
  readonly part: UiPart
  readonly occurrence: Option.Option<string>
}

/** Every mount of `part`, or the part off the page when none is mounted. */
const renderingsOf = (part: UiPart, mounted: ReadonlyArray<UiOccurrence>): Rendering[] => {
  const hits = mounted
    .filter(item => item.part === part.id)
    .map(item => ({ part, occurrence: Option.some(item.id) }))
  return hits.length === 0 ? [{ part, occurrence: Option.none() }] : hits
}

const projectionOf = (part: UiPart, encoded: unknown): Record<string, unknown> => {
  if (encoded === null || typeof encoded !== 'object') return {}
  // `fromEntries` defines own properties, so no field name reaches a prototype.
  return Object.fromEntries(
    part.fields.flatMap(field =>
      Object.hasOwn(encoded, field) ? [[field, Reflect.get(encoded, field)]] : [],
    ),
  )
}

/**
 * Finds the rendering an agent named among the parts whose capability is
 * available now. `mounted` comes from the host, never from the agent. Does
 * not dispatch and does not read the DOM.
 */
export const discover = <Id extends string>(
  runtime: UiRuntime,
  catalog: UiCatalog<Id>,
  query: UiQuery,
  mounted: ReadonlyArray<UiOccurrence<NoInfer<Id>>> = [],
): Effect.Effect<UiDiscovery> =>
  Effect.gen(function* () {
    yield* sameDefinition(runtime, catalog)
    const offered = new Set((yield* runtime.messages.available).map(item => item.name))
    const parts = partsOf(catalog)
    const availablePart = (id: string): UiPart[] => {
      const part = parts.get(id)
      return part !== undefined && offered.has(part.capability) ? [part] : []
    }
    const candidates: ReadonlyArray<Rendering> = UiQuery.match(query, {
      Part: ({ id }) => availablePart(id).flatMap(part => renderingsOf(part, mounted)),
      Occurrence: ({ part: id, id: occurrence }) =>
        availablePart(id).flatMap(part =>
          mounted
            .filter(item => item.part === id && item.id === occurrence)
            .map(item => ({ part, occurrence: Option.some(item.id) })),
        ),
      Label: ({ label }) =>
        [...parts.values()]
          .filter(part => part.label === label && offered.has(part.capability))
          .flatMap(part => renderingsOf(part, mounted)),
    })
    const [only, ...rest] = candidates
    if (only === undefined) return UiDiscovery.None()
    if (rest.length > 0) {
      return UiDiscovery.Ambiguous({
        label: only.part.label,
        matches: candidates.map(rendering => ({
          id: rendering.part.id,
          occurrence: rendering.occurrence,
        })),
      })
    }
    return UiDiscovery.Match({
      id: only.part.id,
      label: only.part.label,
      capability: only.part.capability,
      occurrence: only.occurrence,
      projection: projectionOf(only.part, yield* runtime.context),
    })
  })

/**
 * Dispatches the capability bound to part `id`.
 *
 * An id the catalog does not bind fails before dispatch, including when a
 * capability of that name exists. `dispatchUnknown` then applies the same
 * checks as any other caller.
 */
export const invoke = (
  runtime: UiRuntime,
  catalog: UiCatalog,
  // A string: the id comes from an agent, so an unknown one is a typed failure.
  id: string,
  input: unknown,
  invocation?: Partial<Invocation>,
): Effect.Effect<DispatchResult, DispatchError | UnknownPartError> =>
  Effect.flatMap(
    sameDefinition(runtime, catalog),
    (): Effect.Effect<DispatchResult, DispatchError | UnknownPartError> => {
      const part = partsOf(catalog).get(id)
      if (part === undefined) return Effect.fail(UnknownPartError.of(id))
      return runtime.messages.dispatchUnknown(part.capability, input, invocation)
    },
  )

/** The part catalog, its lookup, and its dispatch. */
export const Ui = { catalog, discover, invoke }
