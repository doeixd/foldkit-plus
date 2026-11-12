/**
 * The Foldkit-facing sync layer: `Sync.forApplication(App).make(config)`
 * compiles an application, a writable projection, and a durable Message subset
 * into the low-level `defineSync` contract, and exposes a read-only Surface over
 * the same projection.
 */
import { Equal, Option, Predicate, Schema } from 'effect'
import {
  MessageSet,
  Projection,
  Surface,
  type AppScope,
  type Contract,
  type MergeConstructors,
  type MergeFields,
  type RunnableApplication,
  type Wiring,
  type WritableProjection,
} from 'foldkit-surface'
import type { DocumentId } from './ids.js'
import type { Migrations } from './migrations.js'
import {
  defineSync,
  type CommitStamp,
  type JournalContract,
  type Operation,
  type Sync,
} from './sync.js'

type MessageConstructor<Message> = (...args: never[]) => Message

/** The Message union a tuple of constructors produces. */
export type MsgOf<Ms extends readonly unknown[]> = Ms[number] extends (...args: never[]) => infer M
  ? M
  : never

type AppMessage<
  AppModel,
  F extends Schema.Struct.Fields,
  Cases extends Record<string, Schema.Struct.Fields>,
> = Schema.Schema.Type<AppScope<AppModel, F, Cases>['Message']>

type AppMessageEncoded<
  AppModel,
  F extends Schema.Struct.Fields,
  Cases extends Record<string, Schema.Struct.Fields>,
> = AppScope<AppModel, F, Cases>['Message']['Encoded']

/** `make`'s Message history, typed by the application's own Message. */
export interface HistoryOption<Message, Encoded> {
  /**
   * The Schemas the document's durable Messages were stored in, ending at the
   * application's own `Message` (`Sync.migrations(V1).next(App.Message, up)`):
   * operations written at an older version are upcast wherever they are read.
   * Without it, the Message is version 1.
   */
  readonly migrations?: Migrations<Message, Encoded> | undefined
}

/**
 * The Messages of the server-only constructors: none for `[]`, which
 * `MsgOf` reads as `unknown` (`never` matches its `infer`).
 */
export type ServerMsgOf<SMs extends readonly unknown[]> = [SMs[number]] extends [never]
  ? never
  : MsgOf<SMs>

/** Reads the tag off a Foldkit Message constructor without constructing one. */
const messageTag = (constructor: unknown): string | undefined => {
  const literal = (constructor as { fields?: { _tag?: { ast?: { literal?: unknown } } } }).fields
    ?._tag?.ast?.literal
  return typeof literal === 'string' ? literal : undefined
}

/** A Message's tag. The application's union is generic here, so its `_tag` is read, not typed. */
const tagOf = (message: unknown): Option.Option<string> =>
  Predicate.hasProperty(message, '_tag') && typeof message._tag === 'string'
    ? Option.some(message._tag)
    : Option.none()

/** The `_tag` literal of the Message a constructor produces. */
type TagOf<C> = C extends (...args: never[]) => infer M
  ? M extends { readonly _tag: infer T extends string }
    ? T
    : never
  : never

/**
 * A journal contract that also carries the declared authorization policy, in
 * the shape `makeJournal` takes, so `makeJournal({ ...contract })` applies it.
 */
export interface PolicyJournalContract<Operation, Shared, Principal> extends JournalContract<
  Operation,
  Shared
> {
  readonly authorize?: (request: {
    readonly principal: Principal
    readonly operation: Operation
    readonly snapshot: Shared
  }) => AuthorizeDecision
}

/**
 * What a rule decides: allowed, refused, or refused with a reason the server
 * sends to the person whose edit it was. The shape of Durable's own decision.
 */
export type AuthorizeDecision = boolean | { readonly allowed: false; readonly reason: string }

/** What a per-variant `authorize` rule sees before the journal commits. */
export interface AuthorizeRequest<Principal, Message, Shared> {
  readonly principal: Principal
  readonly message: Message
  readonly shared: Shared
}

/**
 * Per-variant policy, keyed by durable tag: `message` is that variant exactly,
 * `shared` the authoritative snapshot. A variant without a rule is allowed; the
 * server may still refuse on its own grounds.
 */
export type AuthorizePolicy<
  Principal,
  Fields extends Schema.Struct.Fields,
  Ms extends readonly unknown[],
> = {
  readonly [K in TagOf<Ms[number]>]?: (
    request: AuthorizeRequest<
      Principal,
      Extract<MsgOf<Ms>, { readonly _tag: K }>,
      Schema.Struct.Type<Fields>
    >,
  ) => AuthorizeDecision
}

/**
 * Per-variant commit stamps, keyed by durable tag: each writes what the server's commit
 * decided (its sequence, its actor) into that variant, and returns the same variant. A
 * variant without one is committed as sent.
 */
export type StampPolicy<Ms extends readonly unknown[]> = {
  readonly [K in TagOf<Ms[number]>]?: (
    message: Extract<MsgOf<Ms>, { readonly _tag: K }>,
    commit: CommitStamp,
  ) => Extract<MsgOf<Ms>, { readonly _tag: K }>
}

interface BaseOptions<
  Principal,
  Fields extends Schema.Struct.Fields,
  Ms extends readonly unknown[],
  SMs extends readonly unknown[] = [],
> {
  readonly documentId: DocumentId
  /** Name for the generated `surface`; defaults to the document id. */
  readonly name?: string
  /**
   * Replaces the replay derived from the application's `update`. It is a pure
   * reducer over the shared subset; only durable and server-only Messages reach
   * it, and it runs during admission, replay, and optimistic projection. It is
   * not guarded: the author owns its agreement with `update`.
   */
  readonly replay?: (
    shared: Schema.Struct.Type<NoInfer<Fields>>,
    message: MsgOf<NoInfer<Ms>> | ServerMsgOf<NoInfer<SMs>>,
  ) => Schema.Struct.Type<NoInfer<Fields>>
  /**
   * Authorization the server journal applies before committing, keyed by
   * durable or server-only tag; see `AuthorizePolicy`.
   */
  readonly authorize?: AuthorizePolicy<Principal, NoInfer<Fields>, NoInfer<[...Ms, ...SMs]>>
  /** What the server's commit writes into a stored Message; see `StampPolicy`. */
  readonly stamp?: StampPolicy<NoInfer<[...Ms, ...SMs]>>
  /**
   * Merges a durable Message into the one submitted before it while that one is unsent,
   * so a burst of edits is one operation. Replaying the result must equal replaying
   * `last` then `next`; undefined keeps them apart.
   */
  readonly coalesce?: (
    last: MsgOf<NoInfer<Ms>>,
    next: MsgOf<NoInfer<Ms>>,
  ) => MsgOf<NoInfer<Ms>> | undefined
}

export interface MakeOptions<
  AppModel,
  Fields extends Schema.Struct.Fields,
  Subset,
  Ms extends readonly MessageConstructor<any>[],
  Principal = unknown,
  ServerSubset = never,
  SMs extends readonly MessageConstructor<any>[] = [],
> extends BaseOptions<Principal, Fields, Ms, SMs> {
  /** The writable projection of the shared fields. */
  readonly shared: WritableProjection<AppModel, Fields>
  /** The Message subset a replica submits, records and replays. */
  readonly durable: MessageSet<AppModel, any, Subset, Ms>
  /**
   * The Messages only the server appends (`foldkit-sync/journal`'s
   * `serverJournal`): stored and replayed like durable ones, refused from a
   * replica. A Message in both sets is a type error, and a throw here.
   */
  readonly serverOnly?: MessageSet<AppModel, any, ServerSubset, SMs> | undefined
}

/**
 * One feature's contribution to a document: the fields it shares and the
 * Messages it records. `compose` merges fragments into one, to spread into
 * `make`; a field declared twice with a different codec or a tag declared twice
 * is rejected there.
 */
export interface SyncFragment<
  AppModel,
  Fields extends Schema.Struct.Fields,
  Subset,
  Ms extends readonly MessageConstructor<any>[],
> {
  readonly shared: WritableProjection<AppModel, Fields>
  readonly durable: MessageSet<AppModel, any, Subset, Ms>
}

type SharedOf<Fs extends readonly SyncFragment<any, any, any, any>[]> = {
  readonly [K in keyof Fs]: Fs[K]['shared']
}
type DurableOf<Fs extends readonly SyncFragment<any, any, any, any>[]> = {
  readonly [K in keyof Fs]: Fs[K]['durable']
}
/** The merged shared fields of several fragments. */
export type FragmentFields<Fs extends readonly SyncFragment<any, any, any, any>[]> = MergeFields<
  SharedOf<Fs>
>
/** The concatenated durable constructors of several fragments. */
export type FragmentConstructors<Fs extends readonly SyncFragment<any, any, any, any>[]> =
  MergeConstructors<DurableOf<Fs>>

/** The union of Messages several fragments record. */
export type FragmentMessages<Fs extends readonly SyncFragment<any, any, any, any>[]> =
  Fs[number] extends SyncFragment<any, any, infer V, any> ? V : never

/**
 * The value `make` returns: the low-level `Sync` protocol plus the writable
 * projection, the declared Messages, and a read-only Surface over the
 * projection. Exported so a consumer can name the type.
 */
export interface DefinedSync<
  AppModel,
  Fields extends Schema.Struct.Fields,
  Message,
  Ms extends readonly unknown[],
  Principal = unknown,
  /** `true` when `make` was given `authorize`, so the contract's `authorize` is present. */
  Authorized extends boolean = false,
  /** The server-only constructors, `[]` when `make` was given none. */
  SMs extends readonly unknown[] = [],
> extends Sync<Message, Schema.Struct.Type<Fields>, MsgOf<Ms>> {
  readonly surface: Surface<AppModel, Schema.Struct.Type<Fields>, MsgOf<Ms>, void>
  readonly projection: WritableProjection<AppModel, Fields>
  /** The reducer the replica replays durable Messages with: derived from `update`, or `make`'s `replay`. */
  readonly replay: (
    shared: Schema.Struct.Type<Fields>,
    message: Message,
  ) => Schema.Struct.Type<Fields>
  /** The durable constructors: what a replica submits. */
  readonly messages: Ms
  /** The server-only constructors: what only the server appends. */
  readonly serverOnlyMessages: SMs
  /** For `Module`: this contract owns the shared projection's paths and records the durable and server-only tags. */
  readonly contract: Contract
  /**
   * How this contract joins an assembly: contract-only, so the Module sees it.
   * It routes nothing, runs nothing, and subscribes to nothing; Sync owns the
   * runtime through `mount` rather than joining it.
   */
  readonly wiring: () => Wiring<AppModel, never>
  /** The durable journal's codecs, reducer, and, when declared, authorization. */
  readonly journalContract: () => Authorized extends true
    ? PolicyJournalContract<Operation, Schema.Struct.Type<Fields>, Principal> &
        Required<
          Pick<PolicyJournalContract<Operation, Schema.Struct.Type<Fields>, Principal>, 'authorize'>
        >
    : PolicyJournalContract<Operation, Schema.Struct.Type<Fields>, Principal>
}

/** The sync constructors specialized to one application. */
export interface ApplicationSync<
  AppModel,
  F extends Schema.Struct.Fields,
  Cases extends Record<string, Schema.Struct.Fields>,
  Principal = unknown,
> {
  /**
   * Fixes the `Principal` that `authorize` rules see. A `Principal` cannot be a
   * positional type argument beside an inferred Model, so it is supplied here:
   * `Sync.forApplication(App).withPrincipal<User>()`. Type-only.
   */
  readonly withPrincipal: <P>() => ApplicationSync<AppModel, F, Cases, P>
  /** One feature's shared fields and durable Messages, for `compose`. */
  readonly fragment: <
    Fields extends Schema.Struct.Fields,
    Subset,
    Ms extends readonly MessageConstructor<AppMessage<AppModel, F, Cases>>[],
  >(config: {
    readonly shared: WritableProjection<AppModel, Fields>
    readonly durable: MessageSet<AppModel, any, Subset, Ms>
  }) => SyncFragment<AppModel, Fields, Subset, Ms>
  /**
   * Merges fragments into one: `make({ documentId, ...compose(Todos, Members) })`.
   * A field declared twice with a different codec, a tag declared twice, or a
   * fragment from another application throws.
   */
  readonly compose: <const Fs extends readonly SyncFragment<AppModel, any, any, any>[]>(
    ...fragments: Fs
  ) => SyncFragment<AppModel, FragmentFields<Fs>, FragmentMessages<Fs>, FragmentConstructors<Fs>>
  readonly make: {
    <
      Fields extends Schema.Struct.Fields,
      Subset,
      Ms extends readonly MessageConstructor<AppMessage<AppModel, F, Cases>>[],
      ServerSubset = never,
      // A server-only constructor makes a Message no durable one does, so a
      // variant in both sets fails here, at `serverOnly`.
      SMs extends readonly MessageConstructor<
        Exclude<AppMessage<AppModel, F, Cases>, MsgOf<Ms>>
      >[] = [],
    >(
      options: MakeOptions<AppModel, Fields, Subset, Ms, Principal, ServerSubset, SMs> &
        HistoryOption<AppMessage<AppModel, F, Cases>, AppMessageEncoded<AppModel, F, Cases>> & {
          readonly authorize: AuthorizePolicy<Principal, NoInfer<Fields>, NoInfer<[...Ms, ...SMs]>>
        },
    ): DefinedSync<AppModel, Fields, AppMessage<AppModel, F, Cases>, Ms, Principal, true, SMs>
    <
      Fields extends Schema.Struct.Fields,
      Subset,
      Ms extends readonly MessageConstructor<AppMessage<AppModel, F, Cases>>[],
      ServerSubset = never,
      SMs extends readonly MessageConstructor<
        Exclude<AppMessage<AppModel, F, Cases>, MsgOf<Ms>>
      >[] = [],
    >(
      options: MakeOptions<AppModel, Fields, Subset, Ms, Principal, ServerSubset, SMs> &
        HistoryOption<AppMessage<AppModel, F, Cases>, AppMessageEncoded<AppModel, F, Cases>>,
    ): DefinedSync<AppModel, Fields, AppMessage<AppModel, F, Cases>, Ms, Principal, false, SMs>
  }
}

/**
 * Replay derived from the application's own `update`: install the shared slice
 * into the initial Model, apply the Message, and read the slice back.
 *
 * A durable Message must be a deterministic, state-only transition of the shared
 * projection. Replay refuses one that returns a Command (a live effect cannot be
 * replayed) or that changes a Model field outside the projection (the change
 * would be silently lost), so a Message that needs either stays local and emits
 * a durable fact once the effect settles. What a Message reads is not visible
 * here, where every other field is `initial`: `Sync.mount` checks it against the
 * live Model.
 */
const derivedReplay = <
  AppModel,
  F extends Schema.Struct.Fields,
  Cases extends Record<string, Schema.Struct.Fields>,
  Fields extends Schema.Struct.Fields,
>(
  app: RunnableApplication<AppModel, F, Cases, any>,
  shared: WritableProjection<AppModel, Fields>,
): ((
  value: Schema.Struct.Type<Fields>,
  message: AppMessage<AppModel, F, Cases>,
) => Schema.Struct.Type<Fields>) => {
  const { initial, update } = app
  // Per-field equivalences for the fields the projection does not own outright,
  // built once, so a violation names the fields and replay (which runs per
  // pending operation on every optimistic read) does not re-compare the shared
  // slice against itself. A partially shared field is still compared.
  const owned = new Set(shared.dependencies.filter(path => path.length === 1).map(path => path[0]))
  const fields = Object.entries(app.Model.fields)
    .filter(([key]) => !owned.has(key))
    .map(
      ([key, field]) =>
        [key, Schema.toEquivalence(field as unknown as Schema.Schema<unknown>)] as const,
    )
  return (value, message) => {
    const result = update(shared.set(initial, value), message)
    if (result.commands !== undefined && result.commands.length > 0)
      throw new Error(
        `Sync.forApplication: durable "${Option.getOrElse(tagOf(message), () => 'untagged')}" returned ${result.commands.length} Command(s); a durable transition is state-only`,
      )
    const next = shared.get(result.model)
    // Writing the projection back into the baseline reproduces `update`'s
    // result exactly when it touched only shared fields.
    const written = shared.set(initial, next) as Record<string, unknown>
    const actual = result.model as Record<string, unknown>
    const changed = fields.filter(([key, equal]) => !equal(actual[key], written[key]))
    if (changed.length > 0)
      throw new Error(
        `Sync.forApplication: durable "${Option.getOrElse(tagOf(message), () => 'untagged')}" changed Model fields outside the shared projection: ${changed.map(([key]) => key).join(', ')}`,
      )
    return next
  }
}

/**
 * Merges fragments into one. The primitives reject a conflicting field, a
 * duplicate tag, and a subset from another application.
 */
const composeFragments = (
  fragments: readonly SyncFragment<any, any, any, any>[],
): SyncFragment<any, any, any, any> => {
  const compose = Projection.compose as (
    ...projections: readonly WritableProjection<any, any>[]
  ) => WritableProjection<any, any>
  const union = MessageSet.union as (
    ...subsets: readonly MessageSet<any, any, any, any>[]
  ) => MessageSet<any, any, any, any>
  return {
    shared: compose(...fragments.map(fragment => fragment.shared)),
    durable: union(...fragments.map(fragment => fragment.durable)),
  }
}

/**
 * Specializes the sync constructors to a `Surface.application`, so
 * `Sync.forApplication(App).make({ documentId, shared, durable })` derives the
 * shared codec, the initial snapshot, the durable predicate, and replay from
 * the application, and refuses a subset that belongs to another application.
 * `defineSync` remains the protocol primitive when there is no application to
 * derive from.
 */
export const forApplication = <
  AppModel,
  F extends Schema.Struct.Fields,
  Cases extends Record<string, Schema.Struct.Fields>,
>(
  app: RunnableApplication<AppModel, F, Cases, any>,
): ApplicationSync<AppModel, F, Cases> => build(app)

const build = <
  AppModel,
  F extends Schema.Struct.Fields,
  Cases extends Record<string, Schema.Struct.Fields>,
  Principal,
>(
  app: RunnableApplication<AppModel, F, Cases, any>,
): ApplicationSync<AppModel, F, Cases, Principal> => {
  type Message = AppMessage<AppModel, F, Cases>
  const decodeMessage = Schema.decodeUnknownSync(
    app.Message as unknown as Schema.Codec<Message, unknown>,
  )

  const make = (
    options: MakeOptions<AppModel, any, any, any, Principal, any, any> &
      HistoryOption<Message, unknown>,
  ): DefinedSync<AppModel, any, Message, any, Principal, boolean, any> => {
    type Shared = Record<string, unknown>
    const { shared, durable, migrations, serverOnly } = options
    // A Schema of an older version can equal the current one structurally, so
    // the types cannot tell a history that stops short; identity can.
    if (migrations !== undefined && (migrations.current as unknown) !== app.Message)
      throw new Error("Sync.make: the Message history must end at the application's own Message")

    // Two applications can have structurally identical Message unions, so the
    // types cannot separate them; the owner token can.
    if (durable.owner !== app.owner)
      throw new Error('Sync.make: the durable subset belongs to a different application')
    if (serverOnly !== undefined && serverOnly.owner !== app.owner)
      throw new Error('Sync.make: the server-only subset belongs to a different application')

    const replay: (value: Shared, message: Message) => Shared =
      options.replay === undefined
        ? derivedReplay(app, shared)
        : // `durable` has already rejected anything outside the declared subset.
          (value, message) => options.replay!(value, message as never)
    const tagsOf = (constructors: readonly unknown[]): ReadonlySet<string> =>
      new Set(constructors.map(messageTag).filter((tag): tag is string => tag !== undefined))
    const durableTags = tagsOf(durable.constructors)
    const serverTags = tagsOf(serverOnly?.constructors ?? [])
    // The types refuse this too; a set built by `MessageSet.union` at run time may not be typed.
    for (const tag of serverTags)
      if (durableTags.has(tag))
        throw new Error(`Sync.make: "${tag}" is both durable and server-only`)
    // `AppScope` does not constrain its schemas' services; a Foldkit Message union
    // and a Struct are pure, so the low-level contract's `never` is satisfied.
    const sharedCodec = shared.schema as unknown as Schema.Codec<Shared, unknown>
    const stamps = options.stamp as
      | Record<string, (message: Message, commit: CommitStamp) => Message>
      | undefined
    const sync = defineSync<Message, Shared, unknown, unknown>({
      documentId: options.documentId,
      ...(migrations === undefined
        ? { message: app.Message as unknown as Schema.Codec<Message, unknown> }
        : { migrations }),
      shared: sharedCodec,
      empty: shared.get(app.initial),
      durable: message => Option.exists(tagOf(message), tag => durableTags.has(tag)),
      serverOnly: message => Option.exists(tagOf(message), tag => serverTags.has(tag)),
      replay,
      // `durable` has already rejected anything outside the declared subset.
      coalesce: options.coalesce as
        | ((last: Message, next: Message) => Message | undefined)
        | undefined,
      ...(stamps === undefined
        ? {}
        : {
            stamp: (message: Message, commit: CommitStamp): Message =>
              Option.match(
                Option.flatMapNullishOr(tagOf(message), tag => stamps[tag]),
                {
                  onNone: () => message,
                  onSome: rule => {
                    const stamped = rule(message, commit)
                    if (!Equal.equals(tagOf(stamped), tagOf(message)))
                      throw new Error('A stamp must return the variant it was given')
                    return stamped
                  },
                },
              ),
          }),
    })

    const rules = options.authorize as
      | Record<string, (request: AuthorizeRequest<Principal, Message, Shared>) => AuthorizeDecision>
      | undefined
    const journalContract = (): PolicyJournalContract<Operation, Shared, Principal> => {
      const base = sync.journalContract()
      if (rules === undefined) return base
      return {
        ...base,
        authorize: ({ principal, operation, snapshot }) => {
          const message = decodeMessage(operation.message)
          return Option.match(
            Option.flatMapNullishOr(tagOf(message), tag => rules[tag]),
            {
              onNone: () => true,
              onSome: rule => rule({ principal, message, shared: snapshot }),
            },
          )
        },
      }
    }

    const readOnly: Projection<AppModel, Shared> = Projection.fromReader(sharedCodec, shared.get, {
      dependencies: shared.dependencies,
    })
    const surface = Surface.make(app, options.name ?? String(options.documentId), {
      model: () => readOnly,
      messages: durable.constructors,
    })
    const contract: Contract = {
      kind: 'sync',
      name: surface.name,
      owner: app.owner,
      owns: shared.dependencies,
      observes: shared.dependencies,
      messages: [...durable.tags, ...serverTags],
      metadata: [],
    }
    return {
      ...sync,
      journalContract,
      surface,
      projection: shared,
      replay,
      messages: durable.constructors,
      serverOnlyMessages: serverOnly?.constructors ?? [],
      contract,
      wiring: () => ({ key: `sync:${contract.name}`, handles: [], contract }),
    }
  }

  return {
    withPrincipal: <P>() => build<AppModel, F, Cases, P>(app),
    fragment: config => {
      if (config.durable.owner !== app.owner)
        throw new Error('Sync.fragment: the durable subset belongs to a different application')
      return { shared: config.shared, durable: config.durable }
    },
    compose: ((...fragments: readonly SyncFragment<any, any, any, any>[]) =>
      composeFragments(fragments)) as ApplicationSync<AppModel, F, Cases, Principal>['compose'],
    make: make as ApplicationSync<AppModel, F, Cases, Principal>['make'],
  }
}
