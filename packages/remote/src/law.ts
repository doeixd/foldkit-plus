/**
 * `Law.check`: one operation run through both interpreters, the client's and
 * the server's, and every part the client predicted compared with what the
 * server then holds (operations-phase6-DESIGN §1). Where the client's answer
 * is not unknown, it must equal the server's.
 */
import { Effect, Option, Schema } from 'effect'
import type { AnyEntity } from 'foldkit-entity'
import { RemoteClient } from './client.js'
import type { RemoteDomain } from './index.js'
import type { MutationDescriptor } from './mutation.js'
import { stableStringify, type QueryRef } from './query.js'
import { belongsEncoded } from './matching.js'
import type { RemoteMessage, RemoteModel } from './model.js'
import { entityKey, type EntityStore } from './store.js'
import { REMOTE_PROTOCOL_VERSION } from './wire.js'

/** One part both sides answered, and what each said. */
export interface LawPart {
  /** `Entity:id.field`, `Entity:id` for whether the row is there, or a list's identity. */
  readonly part: string
  readonly client: unknown
  readonly server: unknown
}

/** What `Law.check` compared: the parts both sides agreed on, and those they did not. */
export interface LawReport {
  readonly agreed: ReadonlyArray<string>
  readonly disagreed: ReadonlyArray<LawPart>
  /** Parts the client left to the server: a list it did not place, a field it did not foresee. */
  readonly unknown: ReadonlyArray<string>
}

export interface LawConfig<AppModel> {
  /** The application's Model before the client holds anything; `Remote.make`'s viewer reads it. */
  readonly model: AppModel
  /** The rows the client holds, each read whole as the server's principal sees it. */
  readonly holds: ReadonlyArray<{ readonly entity: AnyEntity; readonly ids: ReadonlyArray<string> }>
  /** Lists the client holds, wholly loaded, whose placements are compared. */
  readonly lists?: ReadonlyArray<QueryRef<string, unknown>> | undefined
  readonly mutation: MutationDescriptor<string, any, any, any>
  readonly input: unknown
  /** When the reader acted: what the client predicts with and the request sends. */
  readonly now: number
}

/** How many rows a list may hold for its placement to be compared: all of them, at once. */
const LIST_WINDOW = 500

/** Every member of `entity` a read can ask for: its fields, its links, its derived members. */
const membersOf = (entity: AnyEntity): ReadonlyArray<string> => [
  ...Object.keys(entity.fields),
  ...Object.entries(entity.relations)
    .filter(([, relation]) => relation.cardinality === 'one')
    .map(([key]) => key),
  ...Object.keys(entity.derived),
]

const same = (left: unknown, right: unknown): boolean =>
  stableStringify(left) === stableStringify(right)

const ids = (edges: ReadonlyArray<{ readonly ref: { readonly id: string } }>) =>
  edges.map(edge => edge.ref.id)

/** Two sides that both said nothing agree, and that agreement is no evidence. */
const nothingCompared = (mutation: string): never => {
  throw new Error(
    `[foldkit-remote] Law.check: ${mutation} compared nothing, so it proves nothing. Hold the rows it writes and reads.`,
  )
}

/**
 * Runs `config.mutation` as the client would, through `Data.mutate` over a
 * Model holding what the server sends this principal, and through the server
 * (`RemoteClient`: `Remote.clientLayer(RemoteServer.handlers(server, principal))`),
 * then compares each predicted field, each predicted deletion and each list's
 * order with what the server answers after the write.
 *
 * Fails when nothing was compared: two sides that both said nothing agree,
 * and that agreement is no evidence.
 */
const check = <AppModel>(
  Data: RemoteDomain<AppModel, any, any, any, any>,
  config: LawConfig<AppModel>,
): Effect.Effect<LawReport, unknown, RemoteClient> =>
  Effect.gen(function* () {
    const client = yield* RemoteClient
    const lists = config.lists ?? []

    // 1. The client holds what the server sends it.
    const requests = config.holds.flatMap(({ entity, ids }) =>
      ids.map(id => ({ entity: entity.name, id, fields: [...membersOf(entity)] })),
    )
    const result = yield* client.read({ version: REMOTE_PROTOCOL_VERSION, requests })
    let model = Data.reduce(config.model, {
      _tag: 'ReadReceived',
      requests,
      result,
      now: config.now,
    })
    const page = (ref: QueryRef<string, unknown>) =>
      client.query({
        query: ref.query,
        input: Schema.encodeSync(ref.Input)(ref.input),
        window: { first: LIST_WINDOW },
      })
    for (const ref of lists) {
      const served = yield* page(ref)
      model = Data.reduce(model, {
        _tag: 'ConnectionMerged',
        connection: ref.identity,
        page: {
          edges: served.edges.map(edge => ({
            key: edge.key,
            ref: { entity: edge.entity, id: edge.id },
          })),
          start: served.start,
          end: served.end,
        },
      })
    }

    // 2. The client predicts, as an application's `update` does.
    const started = Data.mutate(model, config.mutation, config.input, { now: config.now })
    const pending = started.model
    const remote: RemoteModel = Data.store.get(pending)
    const shown: EntityStore = Data.storeOf(pending)
    const layer = remote.optimistic.layers.find(each => each.id === started.requestId)
    const predicted = new Map<string, Set<string>>()
    for (const patch of layer?.patches ?? []) {
      const fields = predicted.get(entityKey(patch.entity, patch.id)) ?? new Set<string>()
      for (const field of [
        ...Object.keys(patch.values),
        ...Object.keys(patch.adds ?? {}),
        ...Object.keys(patch.computes ?? {}),
      ])
        fields.add(field)
      predicted.set(entityKey(patch.entity, patch.id), fields)
    }
    for (const deleted of layer?.deletes ?? [])
      predicted.set(entityKey(deleted.entity, deleted.id), new Set())

    // 3. The server writes, as the client's own Command sends it.
    const answer: RemoteMessage = yield* started.command.effect

    const agreed: Array<string> = []
    const disagreed: Array<LawPart> = []
    const unknown: Array<string> = []
    const compare = (part: string, clientSays: unknown, serverSays: unknown) => {
      if (same(clientSays, serverSays)) agreed.push(part)
      else disagreed.push({ part, client: clientSays, server: serverSays })
    }

    if (answer._tag === 'MutationFailed') {
      // The client showed the write as made, where it showed anything; the server refused it.
      if (predicted.size > 0) compare(config.mutation.name, 'applied', answer.error)
      return disagreed.length === 0
        ? nothingCompared(config.mutation.name)
        : { agreed, disagreed, unknown }
    }

    // 4. What the server holds after it, read as the same principal.
    const rows = [...predicted.keys()].map(key => {
      const at = key.indexOf(':')
      return { entity: key.slice(0, at), id: key.slice(at + 1) }
    })
    const after = yield* client.read({
      version: REMOTE_PROTOCOL_VERSION,
      requests: rows.map(row => ({
        ...row,
        fields: [...(predicted.get(entityKey(row.entity, row.id)) ?? [])],
      })),
    })
    for (const row of rows) {
      const key = entityKey(row.entity, row.id)
      const held = shown[key]
      const stored = after.entities.find(each => each.entity === row.entity && each.id === row.id)
      const settled = new Set(
        after.settled.flatMap(each =>
          each.entity === row.entity && each.id === row.id ? each.fields : [],
        ),
      )
      compare(key, held !== undefined && !held.tombstone, stored !== undefined)
      if (held === undefined || held.tombstone || stored === undefined) continue
      for (const field of predicted.get(key) ?? []) {
        const part = `${key}.${field}`
        if (!held.present.has(field) || settled.has(field)) unknown.push(part)
        else compare(part, held.values[field], stored.values[field])
      }
    }
    // A list the client changed nothing in agrees with the server's for no reason of its own.
    for (const ref of predicted.size === 0 ? [] : lists) {
      const connection = remote.connections[ref.identity]
      const descriptor = Data.definition.registry.queries.get(ref.query)
      const encoded = Schema.encodeSync(ref.Input)(ref.input) as Readonly<Record<string, unknown>>
      // A row the client could not judge is left where it was, or out: the server places it.
      const judged = [...predicted.keys()].every(
        key =>
          descriptor === undefined ||
          belongsEncoded(shown, descriptor, encoded, key, Data.operators, {
            viewer: layer?.viewer ?? Option.none(),
            now: Option.none(),
          }) !== 'unknown',
      )
      if (connection === undefined || connection.stale || !judged) {
        unknown.push(ref.identity)
        continue
      }
      const served = yield* page(ref)
      compare(
        ref.identity,
        ids(Data.visibleItems(remote, ref.identity)),
        ids(served.edges.map(edge => ({ ref: edge }))),
      )
    }

    return agreed.length === 0 && disagreed.length === 0
      ? nothingCompared(config.mutation.name)
      : { agreed, disagreed, unknown }
  })

export const Law = { check }
