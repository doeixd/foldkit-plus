/**
 * `foldkit-mirror` — a Model slice kept in the URL or a key-value store.
 *
 * The Model is the only truth. A mirror names a slice of it (a writable
 * projection over field refs) and keeps an external keyed string store in
 * step with it: the slice is written to the store whenever it changes, and
 * read back into the Model on navigation or cold load. The URL query string
 * and Effect's `KeyValueStore` are the two stores; a mirror is not an owner,
 * and it is last-write-wins with no log, which is what separates it from
 * `foldkit-sync`. See `docs/design/MIRROR.md`.
 */
import { Duration, Effect, Result, Schema, Stream } from 'effect'
import { KeyValueStore } from 'effect/unstable/persistence'
import type { Command } from 'foldkit/command'
import * as Navigation from 'foldkit/navigation'
import type { EntryWithoutKeepAlive } from 'foldkit/subscription'
import type { Url } from 'foldkit/url'
import { Projection, type Contract, type FieldRef, type WritableProjection } from 'foldkit-surface'

// ---------------------------------------------------------------------------
// Stores
// ---------------------------------------------------------------------------

/** The keys a mirror holds in a store, as the store holds them: strings. */
export type Encoded = Readonly<Record<string, string>>

/** The read entry's dependencies: the encoded slice, as a Struct so Foldkit can compare it. */
export interface MirrorDependencies {
  readonly keys: Encoded
}

/** One write to a store: the keys to set, the keys to drop, and how the URL should record it. */
export interface MirrorWrite {
  readonly set: Encoded
  readonly remove: ReadonlyArray<string>
  /** `push` adds a history entry; `replace` does not. A store without history ignores it. */
  readonly intent: 'push' | 'replace'
}

/**
 * A keyed string store a mirror writes to and reads from. Errors are the
 * store's to absorb: a mirror is disposable state, and a failed write must
 * not fail the application.
 */
export interface MirrorStore<R = never> {
  readonly read: Effect.Effect<Encoded | undefined, never, R>
  readonly write: (write: MirrorWrite) => Effect.Effect<void, never, R>
}

/** `MirrorStore.url`: where in the URL the keys live. */
export type UrlLocation = 'search' | 'hash'

/** Splits a same-origin href into its three parts; `search` and `hash` keep their leading `?`/`#`. */
const splitHref = (href: string): { pathname: string; search: string; hash: string } => {
  const hashAt = href.indexOf('#')
  const hash = hashAt < 0 ? '' : href.slice(hashAt)
  const rest = hashAt < 0 ? href : href.slice(0, hashAt)
  const searchAt = rest.indexOf('?')
  return {
    pathname: searchAt < 0 ? rest : rest.slice(0, searchAt),
    search: searchAt < 0 ? '' : rest.slice(searchAt),
    hash,
  }
}

/** The keys a query string holds among `owned`, in URL order. */
const readParams = (query: string, owned: ReadonlyArray<string>): Encoded => {
  const params = new URLSearchParams(
    query.startsWith('?') || query.startsWith('#') ? query.slice(1) : query,
  )
  const out: Record<string, string> = {}
  for (const key of owned) {
    const value = params.get(key)
    if (value !== null) out[key] = value
  }
  return out
}

/** `href` with the mirror's keys set and dropped in its location; every other key, the path, and the other part stay. */
export const applyToHref = (
  href: string,
  write: Pick<MirrorWrite, 'set' | 'remove'>,
  location: UrlLocation = 'search',
): string => {
  const parts = splitHref(href)
  const current = location === 'search' ? parts.search : parts.hash
  const params = new URLSearchParams(current.slice(1))
  for (const key of write.remove) params.delete(key)
  for (const [key, value] of Object.entries(write.set)) params.set(key, value)
  const query = params.toString()
  const next = query === '' ? '' : `${location === 'search' ? '?' : '#'}${query}`
  return location === 'search'
    ? `${parts.pathname}${next}${parts.hash}`
    : `${parts.pathname}${parts.search}${next}`
}

const currentHref = (): string | undefined => {
  const loc = (globalThis as { location?: Location }).location
  return loc === undefined ? undefined : `${loc.pathname}${loc.search}${loc.hash}`
}

const urlStore = (owned: ReadonlyArray<string>, location: UrlLocation): MirrorStore => ({
  read: Effect.sync(() => {
    const href = currentHref()
    if (href === undefined) return undefined
    const parts = splitHref(href)
    return readParams(location === 'search' ? parts.search : parts.hash, owned)
  }),
  write: write =>
    Effect.suspend(() => {
      // Outside a browser (SSR, a test without a DOM) there is no URL to write.
      const href = currentHref()
      if (href === undefined) return Effect.void
      const next = applyToHref(href, write, location)
      if (next === href) return Effect.void
      return write.intent === 'push' ? Navigation.pushUrl(next) : Navigation.replaceUrl(next)
    }),
})

const KV_VERSION = 1

const KvDocument = Schema.Struct({
  version: Schema.Number,
  scope: Schema.optional(Schema.String),
  keys: Schema.Record(Schema.String, Schema.String),
})

const kvStore = (options: {
  readonly key: string
  readonly scope?: string | undefined
}): MirrorStore<KeyValueStore.KeyValueStore> => {
  const decode = Schema.decodeUnknownResult(Schema.fromJsonString(KvDocument))
  const encode = Schema.encodeSync(Schema.fromJsonString(KvDocument))
  return {
    read: Effect.gen(function* () {
      const kv = yield* KeyValueStore.KeyValueStore
      const raw = yield* Effect.result(kv.get(options.key))
      if (Result.isFailure(raw)) {
        yield* Effect.logWarning(`Mirror: could not read "${options.key}"`, raw.failure)
        return undefined
      }
      if (raw.success === undefined) return undefined
      const document = decode(raw.success)
      // Another version, another scope, or malformed: disposable, so drop it and start clean.
      if (
        Result.isFailure(document) ||
        document.success.version !== KV_VERSION ||
        document.success.scope !== options.scope
      ) {
        yield* Effect.result(kv.remove(options.key))
        return undefined
      }
      return document.success.keys
    }),
    write: write =>
      Effect.gen(function* () {
        const kv = yield* KeyValueStore.KeyValueStore
        const text = encode({
          version: KV_VERSION,
          ...(options.scope === undefined ? {} : { scope: options.scope }),
          keys: write.set,
        })
        const outcome = yield* Effect.result(
          Object.keys(write.set).length === 0 ? kv.remove(options.key) : kv.set(options.key, text),
        )
        if (Result.isFailure(outcome)) {
          yield* Effect.logWarning(`Mirror: could not write "${options.key}"`, outcome.failure)
        }
      }),
  }
}

/** An in-memory store that records its writes, for tests and for a mirror with no host. */
export interface MemoryStore extends MirrorStore {
  /** What the store holds now. */
  readonly current: () => Encoded | undefined
  /** Every write, in order. */
  readonly writes: ReadonlyArray<MirrorWrite>
}

const memoryStore = (initial?: Encoded): MemoryStore => {
  let held: Encoded | undefined = initial
  const writes: MirrorWrite[] = []
  return {
    read: Effect.sync(() => held),
    write: write =>
      Effect.sync(() => {
        writes.push(write)
        const next: Record<string, string> = { ...(held ?? {}) }
        for (const key of write.remove) delete next[key]
        Object.assign(next, write.set)
        held = next
      }),
    current: () => held,
    writes,
  }
}

export const MirrorStore = {
  /** The URL's query string (or hash), through `foldkit/navigation`. `owned` are the keys the mirror may touch. */
  url: urlStore,
  /** One JSON document under `key` in Effect's `KeyValueStore`, scoped and versioned. */
  kv: kvStore,
  memory: memoryStore,
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

/** Mirror's Message cases, for `defineMessageUnion({ ...Mirror.messages, … })`. */
export const mirrorMessageCases = {
  /** A store was read (`mirror.restore`); `keys` are what it held for the mirror named. */
  MirrorRestored: { name: Schema.String, keys: Schema.Record(Schema.String, Schema.String) },
} satisfies Record<string, Schema.Struct.Fields>

export interface MirrorRestored {
  readonly _tag: 'MirrorRestored'
  readonly name: string
  readonly keys: Encoded
}

export type MirrorMessage = MirrorRestored

// ---------------------------------------------------------------------------
// Key codecs
// ---------------------------------------------------------------------------

/** A key's text form and back; the decode names what is wrong when it fails. */
interface KeyCodec {
  readonly decode: (text: string) => Result.Result<unknown, string>
  readonly encode: (value: unknown) => string
}

const failure = (message: string): Result.Result<never, string> => Result.fail(message)

/**
 * A key's codec, from an override or derived from the field: the field's
 * encoded form of the initial value says whether the key is text, a number,
 * a boolean, or JSON, and the field schema validates whatever was parsed.
 */
const codecFor = (
  field: Schema.Codec<unknown, unknown, never, never>,
  initial: unknown,
  override: Schema.Codec<unknown, string, never, never> | undefined,
): KeyCodec => {
  if (override !== undefined) {
    const decode = Schema.decodeUnknownResult(override)
    const encode = Schema.encodeSync(override)
    return {
      decode: text => Result.mapError(decode(text), error => error.message),
      encode: value => encode(value),
    }
  }
  const encodeField = Schema.encodeSync(field)
  const decodeField = Schema.decodeUnknownResult(field)
  const shape = typeof encodeField(initial)
  const validate = (candidate: unknown) =>
    Result.mapError(decodeField(candidate), error => error.message)
  return {
    decode: text => {
      switch (shape) {
        case 'string':
          return validate(text)
        case 'number': {
          const value = text.trim() === '' ? Number.NaN : Number(text)
          return Number.isNaN(value) ? failure(`"${text}" is not a number`) : validate(value)
        }
        case 'boolean':
          return text === 'true' || text === 'false'
            ? validate(text === 'true')
            : failure(`"${text}" is not "true" or "false"`)
        default: {
          try {
            return validate(JSON.parse(text))
          } catch {
            return failure(`"${text}" is not JSON`)
          }
        }
      }
    },
    encode: value => {
      const encoded = encodeField(value)
      return shape === 'string' || shape === 'number' || shape === 'boolean'
        ? String(encoded)
        : JSON.stringify(encoded)
    },
  }
}

// ---------------------------------------------------------------------------
// Mirrors
// ---------------------------------------------------------------------------

/** The value type of a field schema. */
type TypeOf<S> = S extends { readonly Type: infer T } ? T : never

/**
 * The slice a mirror keeps: field refs straight from `App.fields`, or a
 * writable projection over them (`Projection.pick`, `Projection.compose`),
 * the same object `foldkit-sync` replicates.
 */
export type Slice = WritableProjection<any, any> | readonly FieldRef<any, any, string>[]

/** The Struct fields of a slice. */
export type SliceFields<S extends Slice> =
  S extends WritableProjection<any, infer Fields>
    ? Fields
    : S extends readonly FieldRef<any, any, string>[]
      ? { readonly [R in S[number] as R['key']]: R['Schema'] }
      : never

/** The Model a slice is of. */
export type SliceRoot<S extends Slice> =
  S extends WritableProjection<infer Root, any>
    ? Root
    : S extends readonly FieldRef<infer Root, any, string>[]
      ? Root
      : never

/** The value a slice reads. */
export type SliceValue<S extends Slice> = Schema.Struct.Type<SliceFields<S>>

const projectionOf = <S extends Slice>(
  slice: S,
): WritableProjection<SliceRoot<S>, SliceFields<S>> =>
  (Array.isArray(slice)
    ? Projection.pick(...(slice as readonly FieldRef<any, any, string>[]))
    : slice) as WritableProjection<SliceRoot<S>, SliceFields<S>>

/** How one field is kept: its store key, its history intent, whether its default is written, and its text codec. */
export interface KeyOptions<Value> {
  /** The store key; default the field name. */
  readonly key?: string | undefined
  /** Whether a change of this key adds a history entry; default `push`. Only the URL has history. */
  readonly history?: 'push' | 'replace' | undefined
  /** Write the key even when the value is the initial one; default false, so a default is elided. */
  readonly keep?: boolean | undefined
  /** The text codec; default derived from the field schema. */
  readonly codec?: Schema.Codec<Value, string, never, never> | undefined
}

export interface MirrorConfig<S extends Slice, Name extends string = string> {
  /** Names the mirror in its contract and its Messages; default from the kind and keys. */
  readonly name?: Name | undefined
  /** The slice: field refs (`[App.fields.filter, App.fields.q]`) or a writable projection over them. */
  readonly fields: S
  readonly keys?:
    { readonly [K in keyof SliceFields<S>]?: KeyOptions<TypeOf<SliceFields<S>[K]>> } | undefined
  /** The Model's initial value, when the application was built without one; defaults are read from it. */
  readonly initial?: SliceRoot<S> | undefined
  /**
   * How long a changed slice waits before it is written; a newer change
   * supersedes a pending write. Browsers rate-limit history writes, so the
   * URL waits 50 ms by default; a store waits 250 ms.
   */
  readonly throttle?: Duration.Input | undefined
}

export interface UrlMirrorConfig<
  S extends Slice,
  Name extends string = string,
> extends MirrorConfig<S, Name> {
  /** Where in the URL the keys live; default the query string. */
  readonly location?: UrlLocation | undefined
}

export interface KvMirrorConfig<S extends Slice, Name extends string = string> extends MirrorConfig<
  S,
  Name
> {
  /** The store key the mirror's document lives under; also the mirror's name unless one is given. */
  readonly key: Name
  /** A user, a tenant: a document of another scope is discarded rather than restored. */
  readonly scope?: string | undefined
}

/** One key that failed to decode; the field keeps its initial value. */
export interface DecodeIssue {
  readonly key: string
  readonly message: string
}

export interface Decoded<Value> {
  /** The fields the store named and decoded. */
  readonly value: Partial<Value>
  readonly issues: ReadonlyArray<DecodeIssue>
}

/**
 * A Model slice kept in a store. `Value` is the slice's value type; the keys,
 * codecs, and intents are values on the mirror, not type parameters.
 * `Mirror.url` and `Mirror.kv` add the `reduce` their store calls for.
 */
export interface Mirror<
  AppModel,
  Value extends Record<string, unknown>,
  R = never,
  Name extends string = string,
> {
  readonly kind: 'url' | 'kv' | 'memory'
  readonly name: Name
  /** Store key per field. */
  readonly keys: Readonly<Record<keyof Value & string, string>>
  /** For `Module`: observes the slice, owns nothing. */
  readonly contract: Contract
  /** The store's keys for a Model, defaults elided unless a key is `keep`. */
  readonly encode: (model: AppModel) => Encoded
  /** The fields a store's keys name; a key that fails to decode is an issue, not a value. */
  readonly decode: (keys: Encoded) => Decoded<Value>
  /**
   * The Model with a store's keys as the whole slice: a key the store lacks,
   * or one that fails to decode, is the initial value.
   */
  readonly fromKeys: (model: AppModel, keys: Encoded) => AppModel
  /**
   * The Model with a store's keys applied to the fields it still holds at
   * their initial value, so a change made before the store answered is kept.
   */
  readonly restoreKeys: (model: AppModel, keys: Encoded) => AppModel
  /** A link: the keys of `model` with `patch` applied, on `base` (default the current URL, else `/`). */
  readonly href: (model: AppModel, patch?: Partial<Value>, base?: string) => string
  /** A Command that reads the store and yields `MirrorRestored` for this mirror. */
  readonly restore: Command<MirrorMessage, never, R>
  /** One Subscription entry, `<name>.mirror`: writes the store when the encoded slice changes. */
  readonly subscriptions: {
    readonly [K in `${Name}.mirror`]: EntryWithoutKeepAlive<AppModel, never, MirrorDependencies, R>
  }
}

/** A slice kept in the URL. */
export interface UrlMirror<
  AppModel,
  Value extends Record<string, unknown>,
  Name extends string = string,
> extends Mirror<AppModel, Value, never, Name> {
  readonly kind: 'url'
  /** The Model with the URL's keys (a Foldkit `Url` or an href) as the whole slice: `fromKeys`. */
  readonly reduce: (model: AppModel, url: Url | string) => AppModel
}

/** A slice kept in Effect's `KeyValueStore`. */
export interface KvMirror<
  AppModel,
  Value extends Record<string, unknown>,
  Name extends string = string,
> extends Mirror<AppModel, Value, KeyValueStore.KeyValueStore, Name> {
  readonly kind: 'kv'
  /** The Model with a `MirrorRestored` for this mirror applied: `restoreKeys`; another mirror's is ignored. */
  readonly reduce: (model: AppModel, message: MirrorRestored) => AppModel
}

const nameOf = (
  kind: Mirror<unknown, Record<string, unknown>>['kind'],
  keys: ReadonlyArray<string>,
  given: string | undefined,
): string => given ?? `${kind}(${keys.join(',')})`

// A URL key belongs to one mirror per application; the same mirror may be
// declared again (a module re-evaluated, a test), another may not take it.
const claimed = new WeakMap<object, Map<string, string>>()

const claim = (
  owner: object,
  location: UrlLocation,
  keys: ReadonlyArray<string>,
  name: string,
): void => {
  let byKey = claimed.get(owner)
  if (byKey === undefined) {
    byKey = new Map()
    claimed.set(owner, byKey)
  }
  for (const key of keys) {
    const at = `${location}:${key}`
    const holder = byKey.get(at)
    if (holder !== undefined && holder !== name) {
      throw new Error(
        `Mirror.url: key "${key}" in the ${location} is already mirrored by "${holder}"; "${name}" cannot mirror it too`,
      )
    }
    byKey.set(at, name)
  }
}

/** An application a mirror is declared over: its identity token, and its initial Model when it has one. */
export interface MirrorApp<AppModel> {
  readonly owner: object
  readonly initial?: AppModel | undefined
}

/** A Foldkit `Url` carries `search` and `hash` without their `?` and `#`; an href has them. */
const withPrefix = (prefix: '?' | '#', part: string): string =>
  part === '' || part.startsWith(prefix) ? part : `${prefix}${part}`

const hrefOf = (url: Url | string): string =>
  typeof url === 'string'
    ? url
    : `${url.pathname}${withPrefix('?', url.search._tag === 'Some' ? url.search.value : '')}${withPrefix(
        '#',
        url.hash._tag === 'Some' ? url.hash.value : '',
      )}`

const make = <S extends Slice, R, Name extends string>(
  app: MirrorApp<SliceRoot<S>>,
  kind: Mirror<unknown, Record<string, unknown>>['kind'],
  store: MirrorStore<R>,
  config: MirrorConfig<S, Name> & { readonly location?: UrlLocation | undefined },
  throttle: Duration.Input,
) => {
  type AppModel = SliceRoot<S>
  type Value = SliceValue<S>
  const fields = projectionOf(config.fields)
  const names = Object.keys(fields.schema.fields)
  const options = (config.keys ?? {}) as Readonly<Record<string, KeyOptions<unknown> | undefined>>
  const initial = config.initial ?? app.initial
  if (initial === undefined) {
    throw new Error(
      `Mirror.${kind}: defaults are read from the initial Model, so build the application with \`initial\` or pass \`initial\` in the config`,
    )
  }
  const initialSlice = fields.get(initial) as Readonly<Record<string, unknown>>
  const location = config.location ?? 'search'

  const keyOf: Record<string, string> = {}
  const fieldOf: Record<string, string> = {}
  const codecs: Record<string, KeyCodec> = {}
  const history: Record<string, 'push' | 'replace'> = {}
  const keep = new Set<string>()
  const initialText: Record<string, string> = {}
  for (const field of names) {
    const option = options[field]
    const key = option?.key ?? field
    if (fieldOf[key] !== undefined) {
      throw new Error(
        `Mirror: fields "${fieldOf[key]}" and "${field}" both use the key "${key}"; give one another key`,
      )
    }
    keyOf[field] = key
    fieldOf[key] = field
    codecs[field] = codecFor(
      fields.schema.fields[field] as Schema.Codec<unknown, unknown, never, never>,
      initialSlice[field],
      option?.codec as Schema.Codec<unknown, string, never, never> | undefined,
    )
    history[field] = option?.history ?? 'push'
    if (option?.keep === true) keep.add(field)
    initialText[field] = codecs[field].encode(initialSlice[field])
  }
  const owned = names.map(field => keyOf[field]!)
  const name = nameOf(kind, owned, config.name) as Name
  if (kind === 'url') claim(app.owner, location, owned, name)

  const encodeSlice = (slice: Readonly<Record<string, unknown>>): Encoded => {
    const out: Record<string, string> = {}
    for (const field of names) {
      const text = codecs[field]!.encode(slice[field])
      if (!keep.has(field) && text === initialText[field]) continue
      out[keyOf[field]!] = text
    }
    return out
  }
  const encode = (model: AppModel): Encoded =>
    encodeSlice(fields.get(model) as Readonly<Record<string, unknown>>)

  const decode = (keys: Encoded): Decoded<Value> => {
    const value: Record<string, unknown> = {}
    const issues: DecodeIssue[] = []
    for (const field of names) {
      const key = keyOf[field]!
      const text = keys[key]
      if (text === undefined) continue
      const decoded = codecs[field]!.decode(text)
      if (Result.isFailure(decoded)) issues.push({ key, message: decoded.failure })
      else value[field] = decoded.success
    }
    return { value: value as Partial<Value>, issues }
  }

  const keysOfUrl = (source: Url | string): Encoded => {
    const parts = splitHref(hrefOf(source))
    return readParams(location === 'search' ? parts.search : parts.hash, owned)
  }

  const fromKeys = (model: AppModel, keys: Encoded): AppModel => {
    const decoded = decode(keys).value as Readonly<Record<string, unknown>>
    return fields.set(model, { ...initialSlice, ...decoded } as never)
  }

  const restoreKeys = (model: AppModel, keys: Encoded): AppModel => {
    const current = fields.get(model) as Readonly<Record<string, unknown>>
    const restored = decode(keys).value as Readonly<Record<string, unknown>>
    const next: Record<string, unknown> = { ...current }
    for (const field of names) {
      // A change the user made before the store answered wins over the store.
      if (codecs[field]!.encode(current[field]) !== initialText[field]) continue
      if (field in restored) next[field] = restored[field]
    }
    return fields.set(model, next as never)
  }

  const href = (model: AppModel, patch?: Partial<Value>, base?: string): string => {
    const slice = { ...(fields.get(model) as Readonly<Record<string, unknown>>), ...patch }
    const set = encodeSlice(slice)
    const remove = owned.filter(key => !(key in set))
    return applyToHref(base ?? currentHref() ?? '/', { set, remove }, location)
  }

  const contract: Contract = {
    kind: 'mirror',
    name,
    owner: app.owner,
    owns: [],
    observes: fields.dependencies,
    messages: kind === 'kv' ? ['MirrorRestored'] : [],
    metadata: [],
  }

  const restore: Command<MirrorMessage, never, R> = {
    name: `Mirror.restore(${name})`,
    effect: store.read.pipe(
      Effect.map((keys): MirrorMessage => ({ _tag: 'MirrorRestored', name, keys: keys ?? {} })),
    ),
  }

  // Writes only what changed, and pushes only for a changed key that pushes:
  // a removal (a key back at its default) never adds a history entry.
  const sync = (encoded: Encoded): Effect.Effect<void, never, R> =>
    Effect.gen(function* () {
      const current = (yield* store.read) ?? {}
      const remove = owned.filter(key => !(key in encoded) && key in current)
      const changed = owned.filter(key => key in encoded && current[key] !== encoded[key])
      if (remove.length === 0 && changed.length === 0) return
      const intent = changed.some(key => history[fieldOf[key]!] === 'push') ? 'push' : 'replace'
      yield* store.write({ set: encoded, remove, intent })
    })

  const entry: EntryWithoutKeepAlive<AppModel, never, MirrorDependencies, R> = {
    dependenciesSchema: Schema.Struct({ keys: Schema.Record(Schema.String, Schema.String) }),
    modelToDependencies: model => ({ keys: encode(model) }),
    dependenciesToStream: ({ keys }) =>
      Stream.fromEffect(sync(keys).pipe(Effect.delay(throttle))).pipe(Stream.drain),
  }

  const mirror: Mirror<AppModel, Value, R, Name> = {
    kind,
    name,
    keys: keyOf as Readonly<Record<keyof Value & string, string>>,
    contract,
    encode,
    decode,
    fromKeys,
    restoreKeys,
    href,
    restore,
    subscriptions: { [`${name}.mirror`]: entry } as Mirror<
      AppModel,
      Value,
      R,
      Name
    >['subscriptions'],
  }
  return { mirror, keysOfUrl }
}

export const Mirror = {
  /** Mirror's Message cases, to spread into the application's union. */
  messages: mirrorMessageCases,

  /** Narrows the application's union to Mirror's cases, by tag. */
  reduces: <M extends { readonly _tag: string }>(
    message: M,
  ): message is Extract<M, { readonly _tag: 'MirrorRestored' }> =>
    Object.hasOwn(mirrorMessageCases, message._tag),

  /**
   * A slice kept in the URL: `Projection.pick(App.fields.filter, App.fields.q)`
   * as `?filter=…&q=…`, defaults elided, written when it changes (one history
   * write per Model change) and read back with `reduce(model, url)` on
   * `onUrlChange` and on cold load.
   */
  url: <S extends Slice, Name extends string = string>(
    app: MirrorApp<SliceRoot<S>>,
    config: UrlMirrorConfig<S, Name>,
  ): UrlMirror<SliceRoot<S>, SliceValue<S>, Name> => {
    const owned = Object.keys(projectionOf(config.fields).schema.fields).map(
      field =>
        (config.keys as Readonly<Record<string, KeyOptions<unknown> | undefined>> | undefined)?.[
          field
        ]?.key ?? field,
    )
    const { mirror, keysOfUrl } = make(
      app,
      'url',
      MirrorStore.url(owned, config.location ?? 'search'),
      config,
      config.throttle ?? '50 millis',
    )
    return {
      ...mirror,
      kind: 'url',
      reduce: (model, url) => mirror.fromKeys(model, keysOfUrl(url)),
    }
  },

  /**
   * A slice kept in Effect's `KeyValueStore` under `key`, as one scoped,
   * versioned JSON document: written when it changes, read back by the
   * `restore` Command whose `MirrorRestored` `reduce` applies.
   */
  kv: <S extends Slice, Name extends string = string>(
    app: MirrorApp<SliceRoot<S>>,
    config: KvMirrorConfig<S, Name>,
  ): KvMirror<SliceRoot<S>, SliceValue<S>, Name> => {
    const { mirror } = make(
      app,
      'kv',
      MirrorStore.kv({
        key: config.key,
        ...(config.scope === undefined ? {} : { scope: config.scope }),
      }),
      { ...config, name: config.name ?? config.key },
      config.throttle ?? '250 millis',
    )
    return {
      ...mirror,
      kind: 'kv',
      reduce: (model, message) =>
        message.name === mirror.name ? mirror.restoreKeys(model, message.keys) : model,
    }
  },

  /** The kernel form: a slice kept in any `MirrorStore`, read back with `fromKeys` or `restoreKeys`. */
  make: <S extends Slice, R, Name extends string = string>(
    app: MirrorApp<SliceRoot<S>>,
    store: MirrorStore<R>,
    config: MirrorConfig<S, Name>,
  ): Mirror<SliceRoot<S>, SliceValue<S>, R, Name> =>
    make(app, 'memory', store, config, config.throttle ?? 0).mirror,
}
