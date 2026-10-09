/**
 * `foldkit-remote-server` — server-side Sources and handler compilation.
 *
 * Owns entity/query Sources, **selection authorization**, normalization, and
 * turning them into Effect RPC handlers. It does not own HTTP, serialization, or
 * auth protocol; `principal` is resolved outside and passed in.
 */
import { Effect, Layer, Queue, Schema, Stream } from 'effect'
import { evaluate, type Row } from 'foldkit-entity'
import {
  REMOTE_PROTOCOL_VERSION,
  Remote,
  RemoteClient,
  RemoteLiveError,
  RemoteMutationError,
  RemoteProtocolError,
  RemoteQueryError,
  RemoteReadError,
  connectionIdentity,
  entityKey,
  refsIn,
  stableStringify,
  type Boundary,
  type ConnectionChangeSchema,
  type ConnectionIdentity,
  type LiveChange,
  type MutationDescriptor,
  type NormalizedPatch,
  type QueryDescriptor,
  type QueryWindow,
  type RelationRequirement,
  type RemoteDescriptor,
  Requirement,
  type RemoteRpcClient,
  MutationRequest,
  QueryRequest,
  ReadBatch,
  RemoteJsonAnswer,
  RemoteJsonRequest,
  RELATION_ALIAS,
  aliasedField,
} from 'foldkit-remote'

/** What a call `RemoteServer.answer` makes can fail with, before the answer says so. */
type AnswerError =
  | Schema.SchemaError
  | RemoteReadError
  | RemoteQueryError
  | RemoteMutationError
  | RemoteProtocolError

export class RemoteServerError extends Schema.TaggedError<RemoteServerError>()(
  'RemoteServerError',
  {
    message: Schema.String,
  },
) {}

/**
 * A mutation Source's refusal, as the value its descriptor's `Refusal`
 * declares: made with `RemoteServer.refuse`, which checks the value's type
 * against the mutation, and sent to the client encoded, beside a message.
 */
export class MutationRefused extends Schema.TaggedError<MutationRefused>()('MutationRefused', {
  /** The mutation the refusal was made for: a Source refusing as another is a bug. */
  mutation: Schema.String,
  refusal: Schema.Unknown,
}) {}

export interface EntityRecord {
  readonly id: string
  readonly values: Readonly<Record<string, unknown>>
}

export interface EntitySourceContext<P> {
  readonly ids: readonly string[]
  readonly fields: readonly string[]
  /** A pagination window per requested relation field. */
  readonly windows?: Readonly<Record<string, QueryWindow>> | undefined
  readonly principal: P
}

export interface EntitySource<P, R = never> {
  readonly entity: string
  /** The fields the entity declares; a request for any other never reaches `read`. */
  readonly fields?: ReadonlySet<string> | undefined
  readonly read: (
    context: EntitySourceContext<P>,
  ) => Effect.Effect<ReadonlyArray<EntityRecord>, RemoteServerError, R>
  /** Returns the fields this principal may read; omitted means all requested. */
  readonly authorize?: (principal: P, fields: readonly string[]) => readonly string[]
}

/** A connection change a mutation made, as the wire carries it. */
export type ConnectionChange = Schema.Schema.Type<typeof ConnectionChangeSchema>

const connectionChange = (
  connection: ConnectionIdentity,
  ref: { readonly entity: string; readonly id: string },
  position: 'prepend' | 'append' | 'remove',
): ConnectionChange => {
  const edge = { entity: ref.entity, id: ref.id, key: entityKey(ref.entity, ref.id) }
  return position === 'remove'
    ? { _tag: 'Remove', connection: connectionIdentity(connection), edge }
    : { _tag: 'Insert', connection: connectionIdentity(connection), position, edge }
}

/**
 * The requested fields, in request order, that the source declares and the
 * principal may read. Never a field the client did not request, even if a
 * permissive `authorize` returns more.
 */
const allowedFields = <P, R>(
  source: EntitySource<P, R>,
  principal: P,
  requested: ReadonlyArray<string>,
): ReadonlyArray<string> => {
  const declared =
    source.fields === undefined ? requested : requested.filter(field => source.fields!.has(field))
  if (declared.length === 0) return []
  const permitted = new Set(
    source.authorize === undefined ? declared : source.authorize(principal, declared),
  )
  return declared.filter(field => permitted.has(field))
}

/** The windows of the fields being read; only a field being read carries its window. */
const windowsOf = (
  windows: Readonly<Record<string, QueryWindow>> | undefined,
  fields: ReadonlyArray<string>,
): { readonly windows?: Readonly<Record<string, QueryWindow>> } => {
  if (windows === undefined) return {}
  const kept = Object.fromEntries(
    fields.flatMap(field =>
      Object.hasOwn(windows, field) ? [[field, windows[field]!] as const] : [],
    ),
  )
  return Object.keys(kept).length === 0 ? {} : { windows: kept }
}

export interface MutationOutcome<Output> {
  readonly output: Output
  readonly entities?: ReadonlyArray<NormalizedPatch>
  /** Connection changes the mutation made; the client settles them with its patches. */
  readonly connections?: ReadonlyArray<ConnectionChange>
  /**
   * Entities the mutation deleted. The client knows them absent from then on:
   * they leave every connection and read `NotFound`, with no connection to name.
   */
  readonly deleted?: ReadonlyArray<{ readonly entity: string; readonly id: string }>
}

export interface MutationSource<P, R = never> {
  readonly mutation: string
  readonly Input: Schema.Codec<unknown>
  readonly Output: Schema.Codec<unknown>
  readonly Refusal: Schema.Codec<unknown, unknown>
  readonly run: (context: {
    readonly input: unknown
    readonly principal: P
    /**
     * The client's id for this request, the same on every retry of it: what a
     * Source keys a record of the write by, so a retry finds it was made.
     */
    readonly requestId: string
  }) => Effect.Effect<
    {
      readonly output: unknown
      readonly entities: ReadonlyArray<NormalizedPatch>
      readonly connections: ReadonlyArray<ConnectionChange>
      readonly deleted: ReadonlyArray<{ readonly entity: string; readonly id: string }>
    },
    RemoteServerError | MutationRefused,
    R
  >
}

export interface QueryPage {
  readonly edges: ReadonlyArray<{
    readonly entity: string
    readonly id: string
    readonly key: string
  }>
  readonly start: Boundary
  readonly end: Boundary
}

export interface QuerySource<P, R = never> {
  readonly query: string
  readonly Input: Schema.Codec<unknown>
  readonly run: (context: {
    readonly input: unknown
    readonly window: QueryWindow
    readonly principal: P
    /**
     * What the client reads of each item. A source may use it to answer
     * fields with the page, or ignore it: the handlers fetch what the page
     * leaves out through the entity sources, so one response still carries
     * both either way.
     */
    readonly select?: RelationRequirement | undefined
  }) => Effect.Effect<QueryPage, RemoteServerError, R>
}

export interface LiveSource<P, R = never> {
  readonly entity: string
  readonly subscribe: (context: {
    readonly requirements: ReadonlyArray<Requirement>
    readonly after: number
    readonly principal: P
  }) => Stream.Stream<Schema.Schema.Type<typeof LiveChange>, RemoteServerError, R>
}

export interface ServerDefinition<P, R = never> {
  readonly entities: ReadonlyMap<string, EntitySource<P, R>>
  readonly mutations: ReadonlyMap<string, MutationSource<P, R>>
  readonly queries: ReadonlyMap<string, QuerySource<P, R>>
  readonly live: ReadonlyMap<string, LiveSource<P, R>>
}

/** A read batch may not carry more than this many distinct ids per entity. */
const DEFAULT_MAX_IDS_PER_ENTITY = 1000

/** A nested selection may not reach further than this many relation levels. */
const DEFAULT_MAX_DEPTH = 8

export interface HandlerOptions<P, R = never> {
  /** A read or live subscription may not name more ids of one entity than this; default 1000. */
  readonly maxIdsPerEntity?: number | undefined
  /** A nested selection may not reach further than this many relation levels; default 8. */
  readonly maxDepth?: number | undefined
  /** A hub whose `changed`/`deleted` signals reach the subscribers this handler registers. */
  readonly live?: LiveHub<P, R> | undefined
}

/** Fails when the requirements name more distinct ids of one entity than `maxIds`. */
/**
 * Each page of a relation read beside another is a source read of its own, and
 * the names come from the client, so how many one relation may have is bounded.
 * A screen shows a list and a page or two of it, not dozens.
 */
const MAX_PAGES_PER_RELATION = 4

/** The relation a request pages more ways than allowed, at any depth; `undefined` when none. */
const checkPagesPerRelation = (
  requirements: ReadonlyArray<RelationRequirement>,
): string | undefined => {
  for (const requirement of requirements) {
    const pages = new Map<string, number>()
    for (const name of requirement.fields) {
      if (!name.includes(RELATION_ALIAS)) continue
      const field = aliasedField(name)
      const count = (pages.get(field) ?? 0) + 1
      if (count > MAX_PAGES_PER_RELATION) return `${requirement.entity}.${field}`
      pages.set(field, count)
    }
    const nested = checkPagesPerRelation(Object.values(requirement.relations ?? {}))
    if (nested !== undefined) return nested
  }
  return undefined
}

const checkIdsPerEntity = (
  requirements: ReadonlyArray<Requirement>,
  maxIds: number,
): string | undefined => {
  const ids = new Map<string, Set<string>>()
  for (const requirement of requirements) {
    const seen = ids.get(requirement.entity) ?? new Set<string>()
    seen.add(requirement.id)
    ids.set(requirement.entity, seen)
    if (seen.size > maxIds) return requirement.entity
  }
  return undefined
}

type LiveChangeValue = Schema.Schema.Type<typeof LiveChange>
type Uncursored<T> = T extends unknown ? Omit<T, 'cursor'> : never

interface LiveRef {
  readonly entity: string
  readonly id: string
}

/**
 * The server-side "these fields changed" signal. A hub tracks each live
 * subscriber's requirements (entity, id, fields) and principal; `changed`
 * re-reads the changed fields a subscriber selects through the entity's own
 * source, under that subscriber's principal, and streams the patch to it.
 * Subscribers that select none of the changed fields do no work. Cursors
 * continue from the cursor each subscriber resumed at, so the client's
 * duplicate and gap handling is unchanged.
 */
export interface LiveHub<P, R = never> {
  readonly changed: (
    ref: LiveRef,
    fields: ReadonlyArray<string>,
  ) => Effect.Effect<void, RemoteServerError, R>
  readonly deleted: (ref: LiveRef) => Effect.Effect<void>
  /** Registers a subscriber for the stream's lifetime; `handlers` calls this. */
  readonly subscribe: (context: {
    readonly requirements: ReadonlyArray<Requirement>
    readonly after: number
    readonly principal: P
    /** Refuses a subscription naming more ids of one entity than this. */
    readonly maxIdsPerEntity?: number | undefined
  }) => Stream.Stream<LiveChangeValue, RemoteServerError>
  /** How many subscribers are registered now. */
  readonly size: Effect.Effect<number>
}

interface Selected {
  readonly fields: Set<string>
  /** The window each paged field was subscribed with, so a re-read pages the same way. */
  readonly windows: Map<string, QueryWindow>
}

/** The subscribers one source read answers, and the fields each wants of it. */
interface ReadGroup<P> {
  readonly windows: Readonly<Record<string, QueryWindow>>
  /** The alias each field read here is answered under. */
  readonly renames: Readonly<Record<string, string>>
  readonly entries: Array<{ readonly subscriber: Subscriber<P>; readonly fields: string[] }>
}

interface Subscriber<P> {
  /** Per entity:id, the fields (and their windows) this subscriber selects. */
  readonly selected: ReadonlyMap<string, Selected>
  readonly principal: P
  readonly queue: Queue.Queue<LiveChangeValue>
  cursor: number
}

const liveHub = <P, R>(entities: ReadonlyArray<EntitySource<P, R>>): Effect.Effect<LiveHub<P, R>> =>
  Effect.sync(() => {
    const sources = new Map(entities.map(source => [source.entity, source]))
    const subscribers = new Set<Subscriber<P>>()
    const emit = (subscriber: Subscriber<P>, change: Uncursored<LiveChangeValue>) => {
      subscriber.cursor += 1
      return Queue.offer(subscriber.queue, {
        ...change,
        cursor: subscriber.cursor,
      } as LiveChangeValue)
    }

    return {
      subscribe: ({ requirements, after, principal, maxIdsPerEntity }) =>
        Stream.unwrap(
          Effect.gen(function* () {
            const over = checkIdsPerEntity(
              requirements,
              Math.max(1, maxIdsPerEntity ?? DEFAULT_MAX_IDS_PER_ENTITY),
            )
            if (over !== undefined) {
              return yield* new RemoteServerError({
                message: `Too many "${over}" ids in one live subscription`,
              })
            }
            const paged = checkPagesPerRelation(requirements)
            if (paged !== undefined) {
              return yield* new RemoteServerError({
                message: `Too many pages of "${paged}" in one live subscription`,
              })
            }
            const selected = new Map<string, Selected>()
            for (const requirement of requirements) {
              const key = `${requirement.entity}:${requirement.id}`
              const entry = selected.get(key) ?? { fields: new Set<string>(), windows: new Map() }
              for (const field of requirement.fields) entry.fields.add(field)
              for (const [field, window] of Object.entries(requirement.windows ?? {})) {
                entry.windows.set(field, window)
              }
              selected.set(key, entry)
            }
            const subscriber: Subscriber<P> = {
              selected,
              principal,
              queue: yield* Queue.unbounded<LiveChangeValue>(),
              cursor: after,
            }
            subscribers.add(subscriber)
            return Stream.fromQueue(subscriber.queue).pipe(
              Stream.ensuring(Effect.sync(() => void subscribers.delete(subscriber))),
            )
          }),
        ),

      changed: (ref, fields) =>
        Effect.gen(function* () {
          const key = `${ref.entity}:${ref.id}`
          const source = sources.get(ref.entity)
          if (source === undefined) return
          // One source read per principal (by identity) and window signature:
          // subscribers sharing both share the read, and a paged field is
          // re-read with the window the subscriber selected it with.
          const groups = new Map<P, Map<string, ReadGroup<P>>>()
          for (const subscriber of subscribers) {
            const selected = subscriber.selected.get(key)
            if (selected === undefined) continue
            const byWindows = groups.get(subscriber.principal) ?? new Map<string, ReadGroup<P>>()
            groups.set(subscriber.principal, byWindows)
            const join = (
              windows: Readonly<Record<string, QueryWindow>>,
              renames: Readonly<Record<string, string>>,
              wanted: string[],
            ): void => {
              const groupKey = `${stableStringify(windows)}\u0000${stableStringify(renames)}`
              const group = byWindows.get(groupKey) ?? { windows, renames, entries: [] }
              byWindows.set(groupKey, group)
              group.entries.push({ subscriber, fields: wanted })
            }
            const wanted = fields.filter(field => selected.fields.has(field))
            if (wanted.length > 0)
              join(
                Object.fromEntries(
                  wanted.flatMap(field => {
                    const window = selected.windows.get(field)
                    return window === undefined ? [] : [[field, window] as const]
                  }),
                ),
                {},
                wanted,
              )
            // A page read under an alias changes when the relation it reads does, and
            // is re-read on its own, with its window, so the whole list can be too.
            for (const alias of selected.fields) {
              const window = selected.windows.get(alias)
              const field = aliasedField(alias)
              if (field === alias || window === undefined || !fields.includes(field)) continue
              join({ [field]: window }, { [field]: alias }, [field])
            }
          }
          for (const [principal, byWindows] of groups) {
            for (const { windows, renames, entries: group } of byWindows.values()) {
              const requested = [...new Set(group.flatMap(entry => entry.fields))]
              const allowed = allowedFields(source, principal, requested)
              if (allowed.length === 0) continue
              const allowedSet = new Set(allowed)
              const records = yield* source.read({
                ids: [ref.id],
                fields: allowed,
                principal,
                ...windowsOf(windows, allowed),
              })
              const record = records.find(candidate => candidate.id === ref.id)
              if (record === undefined) continue
              for (const { subscriber, fields: wanted } of group) {
                const values: Record<string, unknown> = Object.create(null)
                for (const field of wanted) {
                  if (allowedSet.has(field) && Object.hasOwn(record.values, field)) {
                    values[renamed(renames, field)] = record.values[field]
                  }
                }
                const changed = Object.keys(values)
                if (changed.length === 0) continue
                yield* emit(subscriber, {
                  _tag: 'EntityPatched',
                  entity: ref.entity,
                  id: ref.id,
                  values,
                  changed,
                })
              }
            }
          }
        }),

      deleted: ref =>
        Effect.gen(function* () {
          const key = `${ref.entity}:${ref.id}`
          for (const subscriber of subscribers) {
            if (!subscriber.selected.has(key)) continue
            yield* emit(subscriber, { _tag: 'EntityDeleted', entity: ref.entity, id: ref.id })
          }
        }),

      size: Effect.sync(() => subscribers.size),
    }
  })

const protocolMismatch = (received: number): RemoteProtocolError | undefined =>
  received === REMOTE_PROTOCOL_VERSION
    ? undefined
    : new RemoteProtocolError({
        message: `Remote protocol version ${received} is not ${REMOTE_PROTOCOL_VERSION}`,
        expected: REMOTE_PROTOCOL_VERSION,
        received,
      })

interface EntityGroup {
  /** The fields each id was asked for: the union is read, and one id is settled only for its own. */
  readonly ids: Map<string, Set<string>>
  /** The union of the requests' fields, windows, and relations. */
  slice: RelationRequirement
  /** The alias each field read here is answered under; see `RELATION_ALIAS`. */
  readonly renames: Readonly<Record<string, string>>
}

/** A request, or the part of one that reads a relation under an alias. */
type Part = Requirement & { readonly renames?: Readonly<Record<string, string>> }

/**
 * The name a field is answered under. A requested field is client input, so
 * `constructor` must find no rename rather than `Object.prototype`'s.
 */
const renamed = (renames: Readonly<Record<string, string>>, field: string): string =>
  Object.hasOwn(renames, field) ? renames[field]! : field

const pickNames = <T>(
  record: Readonly<Record<string, T>> | undefined,
  names: ReadonlyArray<string>,
): Readonly<Record<string, T>> | undefined => {
  if (record === undefined) return undefined
  const picked = names.flatMap(name =>
    Object.hasOwn(record, name) ? [[name, record[name]!] as const] : [],
  )
  return picked.length === 0 ? undefined : Object.fromEntries(picked)
}

/**
 * A request's aliased fields, each as a read of its own. `comments@first=10` is
 * the `comments` relation read with the alias's window, so a source sees the
 * field it knows and one window for it, while the whole list rides beside it in
 * another read. The answer goes back under the alias, which is also the key of
 * the relation followed from it.
 */
const splitAliases = (request: Requirement): ReadonlyArray<Part> => {
  const aliases = request.fields.filter(field => field.includes(RELATION_ALIAS))
  if (aliases.length === 0) return [request]
  const plain = request.fields.filter(field => !field.includes(RELATION_ALIAS))
  interface Building {
    fields: string[]
    windows: Record<string, QueryWindow>
    relations: Record<string, RelationRequirement>
    renames: Record<string, string>
  }
  // Keyed by requested field names, so a `__proto__` names an entry, not the prototype.
  const keyed = <T>(entries?: Readonly<Record<string, T>>): Record<string, T> =>
    Object.assign(Object.create(null) as Record<string, T>, entries)
  const first: Building = {
    fields: [...plain],
    windows: keyed(pickNames(request.windows, plain)),
    relations: keyed(pickNames(request.relations, plain)),
    renames: keyed(),
  }
  const building: Building[] = [first]
  for (const alias of aliases) {
    const window = request.windows?.[alias]
    // An alias is a page: one that names no window asks for nothing.
    if (window === undefined) continue
    const field = aliasedField(alias)
    // It rides in a read that does not already read its relation, so a request
    // costs one read unless the list and a page of it are both wanted.
    let part = building.find(candidate => !candidate.fields.includes(field))
    if (part === undefined) {
      part = { fields: [], windows: keyed(), relations: keyed(), renames: keyed() }
      building.push(part)
    }
    part.fields.push(field)
    part.windows[field] = window
    part.renames[field] = alias
    const relation = request.relations?.[alias]
    if (relation !== undefined) part.relations[alias] = relation
  }
  return building
    .filter(part => part.fields.length > 0)
    .map(part => ({
      entity: request.entity,
      id: request.id,
      fields: part.fields,
      ...(Object.keys(part.windows).length === 0 ? {} : { windows: part.windows }),
      ...(Object.keys(part.relations).length === 0 ? {} : { relations: part.relations }),
      ...(Object.keys(part.renames).length === 0 ? {} : { renames: part.renames }),
    }))
}

/**
 * One level's requests grouped per entity and window signature: ids and
 * slices unioned. Requests that page a relation differently are separate
 * groups, so one window never answers for another id.
 */
const groupByEntity = (requests: ReadonlyArray<Requirement>): EntityGroup[] => {
  const grouped = new Map<string, EntityGroup>()
  for (const request of requests.flatMap(splitAliases)) {
    const renames = request.renames ?? {}
    const groupKey = `${request.entity}\u0000${stableStringify(request.windows ?? null)}\u0000${stableStringify(renames)}`
    const group = grouped.get(groupKey)
    if (group === undefined) {
      grouped.set(groupKey, {
        ids: new Map([[request.id, new Set(request.fields)]]),
        slice: Requirement.mergeRelation({ entity: request.entity, fields: [] }, request),
        renames,
      })
    } else {
      const asked = group.ids.get(request.id) ?? new Set<string>()
      for (const field of request.fields) asked.add(field)
      group.ids.set(request.id, asked)
      group.slice = Requirement.mergeRelation(group.slice, request)
    }
  }
  return [...grouped.values()]
}

/**
 * A descriptor's name and, when it declares them, its readable members: an
 * Entity's `members` (its fields, relations and derived members), or a plain
 * descriptor's `fields`.
 */
interface EntityName {
  readonly name: string
  readonly fields?: Readonly<Record<string, unknown>> | undefined
  readonly members?: Readonly<Record<string, unknown>> | undefined
}

/** One entity's rows in their wire shape: a relation is its ref key, `'User:u1'`. */
export type MemoryRows = Readonly<
  Record<string, ReadonlyArray<Readonly<Record<string, unknown>> & { readonly id: string }>>
>

/**
 * The rows a memory backend holds, which its mutations write through. A
 * change is what the next read sees; nothing is pushed to a client.
 */
export interface MemoryStore {
  /** The rows of one entity, in insertion order. */
  readonly rows: (entity: string) => ReadonlyArray<Readonly<Record<string, unknown>>>
  /** Writes these values onto a row, creating it if it is new. */
  readonly write: (entity: string, id: string, values: Readonly<Record<string, unknown>>) => void
  readonly remove: (entity: string, id: string) => void
}

export interface MemoryBackend<P = undefined> extends MemoryStore {
  /**
   * A `RemoteClient` answering from the rows as the configured `principal`.
   * Provide it where the real one would go.
   */
  readonly layer: Layer.Layer<RemoteClient>
  /**
   * The server the layer answers through, for serving the rows over a real
   * transport, or as another principal:
   * `RemoteRpc.toLayer(RemoteServer.handlers(backend.server, principal))`.
   */
  readonly server: ServerDefinition<P>
}

/** What `RemoteServer.memory` is made from. See `memory`. */
export type MemoryConfig<P> = {
  readonly domain: Pick<RemoteDescriptor, 'registry'>
  readonly rows: MemoryRows
  readonly queries?: ReadonlyArray<QuerySource<P>>
  readonly mutations?: (store: MemoryStore) => ReadonlyArray<MutationSource<P>>
  /** Per entity name, the fields a principal may read, as `RemoteServer.entity` takes it. */
  readonly authorize?: Readonly<Record<string, NonNullable<EntitySource<P>['authorize']>>>
} & (undefined extends P
  ? { readonly principal?: P }
  : {
      /** Who the `layer` answers as. */
      readonly principal: P
    })

/** Where a cursor falls among ordered items: before `index`, or at it when `exact`. */
interface Position {
  readonly index: number
  readonly exact: boolean
}

/**
 * One page of ordered items for a window, as a real server pages them. A
 * cursor is an item's id: a forward page starts at the `after` it was asked
 * for and ends at its last item while more follow, a backward page the
 * mirror, so a page fetched from another's end cursor joins it.
 *
 * `locate` places a cursor that is not among the items, as a keyset does: a
 * row that stopped matching still has a place in the order. Without it, such
 * a cursor is an error. A page of no items has no id of its own to end at, so
 * with more beyond it and no cursor to repeat, its boundary is `Unknown`.
 */
const pageOf = <Item>(
  items: ReadonlyArray<Item>,
  window: QueryWindow,
  idOf: (item: Item) => string,
  locate?: (cursor: string) => Position,
): { readonly items: ReadonlyArray<Item>; readonly start: Boundary; readonly end: Boundary } => {
  if (
    (window.after !== undefined && window.before !== undefined) ||
    (window.first !== undefined && window.last !== undefined)
  ) {
    throw new Error('A query window cannot combine after with before, or first with last')
  }
  const position = (cursor: string): Position => {
    const index = items.findIndex(item => idOf(item) === cursor)
    if (index >= 0) return { index, exact: true }
    if (locate !== undefined) return locate(cursor)
    throw new Error(`Cursor "${cursor}" names nothing in these results`)
  }
  const cursor = (id: string): Boundary => ({ _tag: 'Cursor', cursor: id })
  const terminal: Boundary = { _tag: 'Terminal' }
  const unknown: Boundary = { _tag: 'Unknown' }
  if (window.last !== undefined || window.before !== undefined) {
    const to = window.before === undefined ? items.length : position(window.before).index
    const from = window.last === undefined ? 0 : Math.max(0, to - window.last)
    const page = items.slice(from, to)
    const start =
      from === 0
        ? terminal
        : page.length > 0
          ? cursor(idOf(page[0]!))
          : window.before === undefined
            ? unknown
            : cursor(window.before)
    return {
      items: page,
      start,
      end: window.before === undefined ? terminal : cursor(window.before),
    }
  }
  const at = window.after === undefined ? undefined : position(window.after)
  const from = at === undefined ? 0 : at.exact ? at.index + 1 : at.index
  const to = window.first === undefined ? items.length : Math.min(items.length, from + window.first)
  const page = items.slice(from, to)
  const end =
    to >= items.length
      ? terminal
      : page.length > 0
        ? cursor(idOf(page.at(-1)!))
        : window.after === undefined
          ? unknown
          : cursor(window.after)
  return { items: page, start: window.after === undefined ? terminal : cursor(window.after), end }
}

/**
 * A backend held in memory: the rows you give it, served through the same
 * handlers a real server uses. For a first run, a test, a story or a demo, with
 * no database and no network.
 *
 * Reads go through `handlers`, so field filtering and nested relations behave
 * as they do in production. A query declared with `Query.define` is answered
 * by running its body over the rows with the reference interpreter, the one
 * every interpreter is held to by the conformance suite. A query with no body
 * has nothing to run and is refused when the backend is made, unless `queries`
 * supplies a source for it. Mutations are yours to give: each one writes
 * through the store it is handed, and the next read sees the change.
 *
 * Every field of every row is readable unless `authorize` names the entity:
 * then its function decides, per principal, as `RemoteServer.entity`'s does.
 * The `layer` answers as `principal`; `server` answers as any. It does not
 * push live changes. It is not a server to deploy.
 */
const memory = <P = undefined>(config: MemoryConfig<P>): MemoryBackend<P> => {
  const authorize = config.authorize ?? {}
  const unknown = Object.keys(authorize).filter(name => !config.domain.registry.entities.has(name))
  if (unknown.length > 0) {
    throw new Error(
      `RemoteServer.memory: \`authorize\` names ${unknown.map(name => `"${name}"`).join(', ')}, which the domain does not declare`,
    )
  }
  const tables = new Map<string, Map<string, Record<string, unknown>>>()
  const table = (entity: string) => {
    const existing = tables.get(entity)
    if (existing !== undefined) return existing
    const created = new Map<string, Record<string, unknown>>()
    tables.set(entity, created)
    return created
  }
  for (const [entity, rows] of Object.entries(config.rows)) {
    // Keyed by the id as the wire carries it, a string, whatever JSON gave.
    for (const row of rows) table(entity).set(String(row.id), { ...row })
  }
  const store: MemoryStore = {
    rows: entity => [...table(entity).values()],
    write: (entity, id, values) => {
      table(entity).set(id, { ...table(entity).get(id), id, ...values })
    },
    remove: (entity, id) => {
      table(entity).delete(id)
    },
  }

  // A relation page is the refs in a window of the stored list. Its cursor is a
  // ref key, or a bare id, as a real server accepts either.
  const valueFor = (value: unknown, window: QueryWindow | undefined): unknown => {
    if (window === undefined || !Array.isArray(value)) return value
    // A ref listed twice would make a cursor ambiguous, and paging cycle.
    const refs = [...new Set(value as ReadonlyArray<string>)]
    const idOf = (ref: string) => ref.slice(ref.indexOf(':') + 1)
    const named = (cursor: string | undefined) =>
      cursor === undefined ? undefined : cursor.includes(':') ? idOf(cursor) : cursor
    let page: ReturnType<typeof pageOf<string>>
    try {
      page = pageOf(
        refs,
        { ...window, after: named(window.after), before: named(window.before) },
        idOf,
      )
    } catch {
      // A cursor that names nothing in the list answers this one field with an
      // empty page. Failing would fail the whole batch it rode in, every other
      // entity and field with it.
      return { refs: [], hasNext: false, hasPrevious: false }
    }
    // A cursor at either end is exactly "more lie that way".
    return {
      refs: page.items,
      hasNext: page.end._tag === 'Cursor',
      hasPrevious: page.start._tag === 'Cursor',
    }
  }

  const entities = [...config.domain.registry.entities.keys()].map(name =>
    RemoteServer.entity<P>(
      { name },
      {
        ...(Object.hasOwn(authorize, name) ? { authorize: authorize[name]! } : {}),
        read: ({ ids, fields, windows }) =>
          Effect.try({
            try: () =>
              ids.flatMap(id => {
                const row = table(name).get(id)
                if (row === undefined) return []
                const values = Object.fromEntries(
                  fields.flatMap(field =>
                    Object.hasOwn(row, field)
                      ? [[field, valueFor(row[field], windows?.[field])] as const]
                      : [],
                  ),
                )
                return [{ id, values }]
              }),
            catch: error =>
              new RemoteServerError({
                message: error instanceof Error ? error.message : String(error),
              }),
          }),
      },
    ),
  )

  const given = new Set((config.queries ?? []).map(source => source.query))
  const bodiless = [...config.domain.registry.queries.values()].filter(
    query => query.body === undefined && !given.has(query.name),
  )
  if (bodiless.length > 0) {
    throw new Error(
      `RemoteServer.memory: ${bodiless.map(query => `"${query.name}"`).join(', ')} ${bodiless.length === 1 ? 'has' : 'have'} no body to run. Declare ${bodiless.length === 1 ? 'it' : 'them'} with Query.define, or give a source in \`queries\`.`,
    )
  }
  const queries = [
    ...(config.queries ?? []),
    ...[...config.domain.registry.queries.values()]
      .filter(query => !given.has(query.name))
      .map(query =>
        RemoteServer.query<P>(query, ({ input, window }) =>
          Effect.try({
            try: () => {
              const body = query.body!
              const encoded = Schema.encodeSync(query.Input)(input) as Readonly<
                Record<string, unknown>
              >
              const entity = body.entity.name
              const rows = store.rows(entity) as ReadonlyArray<Row>
              const matched = evaluate(body, encoded, rows)
              // A cursor row that no longer matches still has a place in the
              // order, as a keyset has it: sort it among the matches with the
              // predicates set aside. One that no longer exists has none.
              const locate = (cursor: string) => {
                const row = rows.find(candidate => String(candidate.id) === cursor)
                if (row === undefined) {
                  throw new Error(`Cursor "${cursor}" names a row that no longer exists`)
                }
                const placed = evaluate({ ...body, where: [] } as typeof body, encoded, [
                  ...matched,
                  row,
                ])
                return { index: placed.indexOf(row), exact: false }
              }
              const page = pageOf(matched, window, row => String(row.id), locate)
              return {
                edges: page.items.map(row => {
                  const id = String(row.id)
                  return { entity, id, key: entityKey(entity, id) }
                }),
                start: page.start,
                end: page.end,
              }
            },
            catch: error =>
              new RemoteServerError({
                message: error instanceof Error ? error.message : String(error),
              }),
          }),
        ),
      ),
  ]

  const server = RemoteServer.make<P>({
    entities,
    queries,
    mutations: config.mutations?.(store) ?? [],
  })
  return {
    ...store,
    server,
    layer: Remote.clientLayer(
      // `principal` is required by the config's type unless `P` admits undefined.
      RemoteServer.handlers(server, config.principal as P),
    ) as Layer.Layer<RemoteClient>,
  }
}

/**
 * A Source's refusal as the client receives it: encoded by the mutation's own
 * `Refusal`. A refusal made for another mutation, or one the mutation does not
 * declare, is this side's bug, and says so without the value.
 */
const refusalError = (
  Refusal: Schema.Codec<unknown, unknown>,
  mutation: string,
  refused: MutationRefused,
): Effect.Effect<never, RemoteMutationError> =>
  Effect.gen(function* () {
    const invalid = new RemoteMutationError({ message: 'Invalid mutation refusal' })
    if (refused.mutation !== mutation) return yield* invalid
    const encoded = yield* Schema.encodeUnknownEffect(Refusal)(refused.refusal).pipe(
      Effect.mapError(() => invalid),
    )
    return yield* new RemoteMutationError({
      message: `Mutation ${mutation} was refused`,
      refusal: encoded,
    })
  })

export const RemoteServer = {
  /** A backend held in memory, for a first run, a test or a demo. See `memory`. */
  memory,

  /** A mutation outcome's report that `ref` now heads the connection. */
  prepend: (
    connection: ConnectionIdentity,
    ref: { readonly entity: string; readonly id: string },
  ): ConnectionChange => connectionChange(connection, ref, 'prepend'),

  /** A mutation outcome's report that `ref` now ends the connection. */
  append: (
    connection: ConnectionIdentity,
    ref: { readonly entity: string; readonly id: string },
  ): ConnectionChange => connectionChange(connection, ref, 'append'),

  /** A mutation outcome's report that `ref` left the connection. */
  remove: (
    connection: ConnectionIdentity,
    ref: { readonly entity: string; readonly id: string },
  ): ConnectionChange => connectionChange(connection, ref, 'remove'),

  /**
   * An entity source. Given the Entity, every member it declares (fields,
   * relations, derived members) may be requested; given anything with a
   * `name` and `fields`, those fields. A request for anything else never
   * reaches `read` or `authorize`. Given only a `name`, every field passes.
   */
  entity: <P = unknown, R = never>(
    entity: EntityName,
    options: {
      readonly read: EntitySource<P, R>['read']
      readonly authorize?: EntitySource<P, R>['authorize']
    },
  ): EntitySource<P, R> => ({
    entity: entity.name,
    ...((entity.members ?? entity.fields) === undefined
      ? {}
      : { fields: new Set(Object.keys(entity.members ?? entity.fields!)) }),
    read: options.read,
    ...(options.authorize === undefined ? {} : { authorize: options.authorize }),
  }),

  mutation: <
    P = unknown,
    R = never,
    Name extends string = string,
    Input = unknown,
    Output = unknown,
    Refused = unknown,
  >(
    mutation: MutationDescriptor<Name, Input, Output, Refused>,
    run: (context: {
      readonly input: Input
      readonly principal: P
      /** The client's id for this request, the same on every retry of it. */
      readonly requestId: string
    }) => Effect.Effect<MutationOutcome<Output>, RemoteServerError | MutationRefused, R>,
  ): MutationSource<P, R> => ({
    mutation: mutation.name,
    Input: mutation.Input,
    Output: mutation.Output,
    Refusal: mutation.Refusal,
    run: context =>
      run({
        input: context.input as Input,
        principal: context.principal,
        requestId: context.requestId,
      }).pipe(
        Effect.map(outcome => ({
          output: outcome.output,
          entities: outcome.entities ?? [],
          connections: outcome.connections ?? [],
          deleted: outcome.deleted ?? [],
        })),
      ),
  }),

  /**
   * A refusal of `mutation`, as a value of its declared `Refusal`: fail a
   * Source with it (`yield* RemoteServer.refuse(SavePost, { _tag: 'Field', ... })`)
   * and the client reads it, decoded, with `Data.refusal`.
   */
  refuse: <Refused>(
    mutation: MutationDescriptor<string, any, any, Refused>,
    refusal: NoInfer<Refused>,
  ): MutationRefused => new MutationRefused({ mutation: mutation.name, refusal }),

  query: <P = unknown, R = never, Input = unknown>(
    query: QueryDescriptor<string, Input, unknown>,
    run: (context: {
      readonly input: Input
      readonly window: QueryWindow
      readonly principal: P
      readonly select?: RelationRequirement | undefined
    }) => Effect.Effect<QueryPage, RemoteServerError, R>,
  ): QuerySource<P, R> => ({
    query: query.name,
    Input: query.Input,
    run: context =>
      run({
        input: context.input as Input,
        window: context.window,
        principal: context.principal,
        ...(context.select === undefined ? {} : { select: context.select }),
      }),
  }),

  /** Streams live entity patches for a client's live requirements. */
  live: <P = unknown, R = never>(
    entity: EntityName,
    options: { readonly subscribe: LiveSource<P, R>['subscribe'] },
  ): LiveSource<P, R> => ({
    entity: entity.name,
    subscribe: options.subscribe,
  }),

  /**
   * A `LiveHub` over entity sources. Pass it to `handlers` as `live`, and every
   * mutation's answered patches and deletions are published to it; call
   * `hub.changed(ref, fields)` yourself only for a write that is not a
   * mutation (a database trigger, a job). Each subscriber that selects any of
   * those fields receives them, re-read through the entity source under its
   * own principal.
   */
  liveHub,

  make: <P = unknown, R = never>(config: {
    readonly entities: readonly EntitySource<P, R>[]
    readonly mutations?: readonly MutationSource<P, R>[]
    readonly queries?: readonly QuerySource<P, R>[]
    readonly live?: readonly LiveSource<P, R>[]
  }): ServerDefinition<P, R> => ({
    entities: new Map(config.entities.map(source => [source.entity, source])),
    mutations: new Map((config.mutations ?? []).map(source => [source.mutation, source])),
    queries: new Map((config.queries ?? []).map(source => [source.query, source])),
    live: new Map((config.live ?? []).map(source => [source.entity, source])),
  }),

  /**
   * Checks every source name against the declared domain, so an undeclared
   * entity/query/mutation fails at startup rather than returning nothing at
   * call time.
   */
  validate: (domain: RemoteDescriptor, server: ServerDefinition<any, any>): void => {
    const assertDeclared = (
      kind: string,
      declared: ReadonlyMap<string, unknown>,
      names: Iterable<string>,
    ): void => {
      for (const name of names) {
        if (!declared.has(name))
          throw new Error(`RemoteServer: ${kind} "${name}" is not declared in the Remote domain`)
      }
    }
    assertDeclared('entity', domain.registry.entities, server.entities.keys())
    assertDeclared('query', domain.registry.queries, server.queries.keys())
    assertDeclared('mutation', domain.registry.mutations, server.mutations.keys())
  },

  /**
   * Compiles the server into the `Read`/`Mutate` RPC handlers. `principal` is
   * resolved outside (authentication middleware in a later phase); unknown
   * entities, entities with no allowed fields, and unknown mutations return an
   * error or nothing rather than leaking existence.
   */
  /**
   * Reads entity requirements through the entity sources, level by level,
   * following relations as `FoldkitRemoteRead` does. Shared by the read
   * handler and the query handler's payload: a query page's items are just
   * requirements the page names, so one response carries both.
   */
  readHelper: <P, R>(
    server: ServerDefinition<P, R>,
    principal: P,
    options: HandlerOptions<P, R>,
    requests: ReadonlyArray<Requirement>,
  ): Effect.Effect<
    {
      readonly entities: Array<{
        readonly entity: string
        readonly id: string
        readonly values: Record<string, unknown>
      }>
      readonly settled: Array<{
        readonly entity: string
        readonly id: string
        readonly fields: Array<string>
      }>
    },
    RemoteReadError,
    R
  > =>
    Effect.gen(function* () {
      const entities: Array<{
        readonly entity: string
        readonly id: string
        readonly values: Record<string, unknown>
      }> = []
      const settled = new Map<string, { entity: string; id: string; fields: Set<string> }>()
      const settle = (entity: string, id: string, fields: ReadonlyArray<string>): void => {
        if (fields.length === 0) return
        const key = `${entity}:${id}`
        const entry = settled.get(key) ?? { entity, id, fields: new Set<string>() }
        for (const field of fields) entry.fields.add(field)
        settled.set(key, entry)
      }
      const fetched = new Map<string, Set<string>>()
      const fetchedValues = new Map<string, Record<string, unknown>>()
      const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH
      const maxIds = Math.max(1, options.maxIdsPerEntity ?? DEFAULT_MAX_IDS_PER_ENTITY)

      const over = checkIdsPerEntity(requests, maxIds)
      if (over !== undefined) {
        return yield* new RemoteReadError({ message: `Too many "${over}" ids in one read batch` })
      }
      const paged = checkPagesPerRelation(requests)
      if (paged !== undefined) {
        return yield* new RemoteReadError({ message: `Too many pages of "${paged}" in one read` })
      }

      let pending: ReadonlyArray<Requirement> = requests
      for (let depth = 0; pending.length > 0; depth++) {
        if (depth > maxDepth) {
          return yield* new RemoteReadError({
            message: `Nested selection deeper than ${maxDepth} relation levels`,
          })
        }
        const next: Requirement[] = []

        const follow = (
          values: Record<string, unknown>,
          relations: Readonly<Record<string, RelationRequirement>>,
        ): void => {
          for (const [field, relation] of Object.entries(relations)) {
            if (!Object.hasOwn(values, field)) continue
            for (const ref of refsIn(values[field])) {
              if (ref.entity !== relation.entity) continue
              const key = `${relation.entity}:${ref.id}`
              const read = fetched.get(key)
              const fields = relation.fields.filter(name => read?.has(name) !== true)
              if (fields.length > 0) {
                next.push({
                  entity: relation.entity,
                  id: ref.id,
                  fields,
                  ...(relation.windows === undefined ? {} : { windows: relation.windows }),
                  ...(relation.relations === undefined ? {} : { relations: relation.relations }),
                })
              } else if (relation.relations !== undefined) {
                follow(fetchedValues.get(key) ?? {}, relation.relations)
              }
            }
          }
        }

        for (const { ids, slice, renames } of groupByEntity(pending)) {
          const name = slice.entity
          const source = server.entities.get(name)
          if (source === undefined) continue
          const allowed = allowedFields(source, principal, slice.fields)
          const allowedSet = new Set(allowed)
          const idList = [...ids.keys()]
          for (const [id, asked] of ids) {
            settle(
              name,
              id,
              [...asked]
                .filter(field => !allowedSet.has(field))
                .map(field => renamed(renames, field)),
            )
          }
          if (allowed.length === 0) continue

          const windows = windowsOf(slice.windows, allowed)
          const records: EntityRecord[] = []
          for (let start = 0; start < idList.length; start += maxIds) {
            records.push(
              ...(yield* source
                .read({
                  ids: idList.slice(start, start + maxIds),
                  fields: allowed,
                  principal,
                  ...windows,
                })
                .pipe(
                  Effect.catchTag('RemoteServerError', error =>
                    Effect.fail(new RemoteReadError({ message: error.message })),
                  ),
                )),
            )
          }

          for (const record of records) {
            const values: Record<string, unknown> = Object.create(null)
            const omitted: string[] = []
            const asked = ids.get(record.id)
            for (const field of allowed) {
              if (Object.hasOwn(record.values, field))
                values[renamed(renames, field)] = record.values[field]
              else if (asked?.has(field) === true) omitted.push(renamed(renames, field))
            }
            entities.push({ entity: name, id: record.id, values })
            settle(name, record.id, omitted)

            const key = `${name}:${record.id}`
            const known = fetched.get(key) ?? new Set<string>()
            for (const field of allowed) known.add(renamed(renames, field))
            fetched.set(key, known)
            fetchedValues.set(key, { ...fetchedValues.get(key), ...values })

            follow(values, slice.relations ?? {})
          }
        }
        pending = next.flatMap(request => {
          const read = fetched.get(`${request.entity}:${request.id}`)
          const fields = request.fields.filter(field => read?.has(field) !== true)
          return fields.length === 0 ? [] : [{ ...request, fields }]
        })
      }

      return {
        entities,
        settled: [...settled.values()].map(entry => ({ ...entry, fields: [...entry.fields] })),
      }
    }),

  /**
   * Answers one JSON request through `handlers`: what an HTTP endpoint, a
   * worker or a server in the page calls with the body it received, parsed.
   * The request and its payload are decoded by the protocol's own schemas
   * before a handler sees them, so an operation name is one of Remote's three
   * and nothing else. A body that is not a request is a 400; a handler's
   * failure a 500 with its message; a defect a 500 that says nothing of it.
   * `Remote.json` and `Remote.http` are the other end.
   */
  answer: <R>(
    handlers: RemoteRpcClient<R>,
    body: unknown,
  ): Effect.Effect<
    { readonly status: 200 | 400 | 422 | 500; readonly body: RemoteJsonAnswer },
    never,
    R
  > => {
    const asked = {
      read: (payload: unknown) =>
        Effect.flatMap(Schema.decodeUnknownEffect(ReadBatch)(payload), handlers.FoldkitRemoteRead),
      query: (payload: unknown) =>
        Effect.flatMap(
          Schema.decodeUnknownEffect(QueryRequest)(payload),
          handlers.FoldkitRemoteQuery,
        ),
      mutate: (payload: unknown) =>
        Effect.flatMap(
          Schema.decodeUnknownEffect(MutationRequest)(payload),
          handlers.FoldkitRemoteMutate,
        ),
    }
    return Schema.decodeUnknownEffect(RemoteJsonRequest)(body).pipe(
      Effect.flatMap(({ operation, payload }): Effect.Effect<unknown, AnswerError, R> =>
        asked[operation](payload),
      ),
      Effect.map(result => ({ status: 200 as const, body: { result } })),
      Effect.catchTag('SchemaError', error =>
        Effect.succeed({ status: 400 as const, body: { error: error.message } }),
      ),
      // A refusal is the mutation's answer, not a failure of the server.
      Effect.catchTag('RemoteMutationError', error =>
        Effect.succeed(
          error.refusal === undefined
            ? { status: 500 as const, body: { error: error.message } }
            : { status: 422 as const, body: { error: error.message, refusal: error.refusal } },
        ),
      ),
      Effect.catch(error =>
        Effect.succeed({ status: 500 as const, body: { error: error.message } }),
      ),
      // A defect is a bug on this side: the caller learns there was one, not what.
      Effect.catchCause(() =>
        Effect.succeed({ status: 500 as const, body: { error: 'Internal error' } }),
      ),
    )
  },

  handlers: <P, R>(
    server: ServerDefinition<P, R>,
    principal: P,
    options: HandlerOptions<P, R> = {},
  ): RemoteRpcClient<R> => ({
    FoldkitRemoteRead: Effect.fn('RemoteServer.FoldkitRemoteRead')(function* (payload) {
      const mismatch = protocolMismatch(payload.version)
      if (mismatch !== undefined) return yield* mismatch
      return yield* RemoteServer.readHelper(server, principal, options, payload.requests)
    }),

    FoldkitRemoteMutate: Effect.fn('RemoteServer.FoldkitRemoteMutate')(function* (payload) {
      const source = server.mutations.get(payload.mutation)
      if (source === undefined) {
        return yield* new RemoteMutationError({
          message: `Unknown mutation: ${payload.mutation}`,
        })
      }

      const input = yield* Schema.decodeUnknownEffect(source.Input)(payload.input).pipe(
        Effect.catchTag('SchemaError', () =>
          Effect.fail(new RemoteMutationError({ message: 'Invalid mutation input' })),
        ),
      )

      const outcome = yield* source.run({ input, principal, requestId: payload.requestId }).pipe(
        Effect.catchTag('RemoteServerError', error =>
          Effect.fail(new RemoteMutationError({ message: error.message })),
        ),
        Effect.catchTag('MutationRefused', refused =>
          refusalError(source.Refusal, payload.mutation, refused),
        ),
      )

      const output = yield* Schema.encodeUnknownEffect(source.Output)(outcome.output).pipe(
        Effect.catchTag('SchemaError', () =>
          Effect.fail(new RemoteMutationError({ message: 'Invalid mutation output' })),
        ),
      )

      // What the mutation answers is what changed, so live subscribers hear it
      // without the handler naming it again. The write has committed by now: a
      // failed publish is logged, never the mutation's failure, which a client
      // would retry.
      const hub = options.live
      if (hub !== undefined) {
        yield* Effect.forEach(outcome.entities, patch =>
          hub.changed({ entity: patch.entity, id: patch.id }, Object.keys(patch.values)),
        ).pipe(
          Effect.andThen(Effect.forEach(outcome.deleted, gone => hub.deleted(gone))),
          Effect.catchCause(cause =>
            Effect.logWarning(
              'RemoteServer: a mutation committed but its live publish failed',
              cause,
            ),
          ),
        )
      }

      return {
        output,
        entities: outcome.entities.map(patch => ({
          entity: patch.entity,
          id: patch.id,
          values: patch.values,
        })),
        connections: outcome.connections,
        deleted: outcome.deleted.map(gone => ({ entity: gone.entity, id: gone.id })),
      }
    }),

    FoldkitRemoteQuery: Effect.fn('RemoteServer.FoldkitRemoteQuery')(function* (payload) {
      const source = server.queries.get(payload.query)
      if (source === undefined) {
        return yield* new RemoteQueryError({ message: `Unknown query: ${payload.query}` })
      }

      const input = yield* Schema.decodeUnknownEffect(source.Input)(payload.input).pipe(
        Effect.catchTag('SchemaError', () =>
          Effect.fail(new RemoteQueryError({ message: 'Invalid query input' })),
        ),
      )

      const select = payload.select
      if (select !== undefined) {
        const paged = checkPagesPerRelation([select])
        if (paged !== undefined) {
          return yield* new RemoteQueryError({
            message: `Too many pages of "${paged}" in one query select`,
          })
        }
      }

      const page = yield* source
        .run({
          input,
          window: payload.window,
          principal,
          ...(select === undefined ? {} : { select }),
        })
        .pipe(
          Effect.catchTag('RemoteServerError', error =>
            Effect.fail(new RemoteQueryError({ message: error.message })),
          ),
        )

      if (select === undefined) return { edges: page.edges, start: page.start, end: page.end }
      // The page's items as requirements, so the selected fields ride back
      // with the edges in one response. Edges of another entity (a query
      // lists one) take no fields: the client's planner asks for them next.
      const requirements: Requirement[] = page.edges.flatMap(edge =>
        edge.entity === select.entity
          ? [
              {
                entity: select.entity,
                id: edge.id,
                fields: [...select.fields],
                ...(select.windows === undefined ? {} : { windows: select.windows }),
                ...(select.relations === undefined ? {} : { relations: select.relations }),
              },
            ]
          : [],
      )
      if (requirements.length === 0)
        return { edges: page.edges, start: page.start, end: page.end, entities: [], settled: [] }
      const read = yield* RemoteServer.readHelper(server, principal, options, requirements).pipe(
        Effect.catchTag('RemoteReadError', error =>
          Effect.fail(new RemoteQueryError({ message: error.message })),
        ),
      )
      return { edges: page.edges, start: page.start, end: page.end, ...read }
    }),

    FoldkitRemoteLive: payload => {
      const mismatch = protocolMismatch(payload.version)
      if (mismatch !== undefined) return Stream.fail(mismatch)
      const entities = [...new Set(payload.requirements.map(request => request.entity))]
      const streams: Array<Stream.Stream<LiveChangeValue, RemoteServerError, R>> = entities.flatMap(
        entity => {
          const source = server.live.get(entity)
          if (source === undefined) return []
          return [
            source.subscribe({
              requirements: payload.requirements.filter(request => request.entity === entity),
              after: payload.after,
              principal,
            }),
          ]
        },
      )
      if (options.live !== undefined) {
        streams.push(
          options.live.subscribe({
            requirements: payload.requirements,
            after: payload.after,
            principal,
            maxIdsPerEntity: options.maxIdsPerEntity,
          }),
        )
      }
      // An entity with no live source simply contributes nothing; the client's
      // planner refetches it rather than the stream failing.
      return Stream.mergeAll(streams, { concurrency: 'unbounded' }).pipe(
        Stream.mapError(error => new RemoteLiveError({ message: error.message })),
      )
    },
  }),
}

export * from './evaluate.js'
