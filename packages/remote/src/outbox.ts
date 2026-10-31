/**
 * `foldkit-remote/outbox`: durable writes (`Data.mutate`'s `durable`) kept
 * across a reload and sent in order by one tab (#247). An entry of its own
 * (#378), so a page with no outbox keeps none of its store, locks or sending.
 */
import { Clock, Data, Effect, Option, Queue, Result, Schema, Stream } from 'effect'
import { KeyValueStore } from 'effect/persistence'
import * as Subscription from 'foldkit/subscription'
import type { EntryWithoutKeepAlive } from 'foldkit/subscription'
import type { Wiring } from 'foldkit-surface'
import { mintOperation, mutateRemote, remoteError, type RemoteClient } from './client.js'
import { remoteMessageSchema, type RemoteMessage, type RemoteModel } from './model.js'
import type { MutationDescriptor } from './mutationDescriptor.js'
import {
  backoff,
  channelFor,
  headOf,
  mergeStored,
  onlineAgain,
  othersWaiting,
  readEntries,
  readStored,
  sendLock,
  settledIn,
  storedFromText,
  storedOf,
  storedText,
  storeLock,
  StoredWrite,
  withLock,
  type RetryOptions,
  type StoredOutbox,
} from './outboxStore.js'
import { Queued, type OutboxState } from './queue.js'
import type { RemoteError } from './remoteData.js'

export type { RetryOptions } from './outboxStore.js'

/** What `outbox` and `outboxStatus` use of a domain: `Remote.make`'s value is one. */
export interface OutboxDomain<AppModel> {
  readonly registry: {
    readonly mutations: ReadonlyMap<string, MutationDescriptor<any, any, any>>
  }
  readonly store: { get(model: AppModel): RemoteModel }
  readonly contract: { readonly name: string }
  reduce(model: AppModel, message: RemoteMessage): AppModel
}

/** How `outbox` keeps durable writes across a reload. */
export interface OutboxOptions<AppModel> {
  /**
   * Where the queue is stored, from the Model: one key per principal, so one
   * person's waiting writes are never sent as another's.
   */
  readonly key: (model: AppModel) => string
  /**
   * Who the queue is for, the principal. One stored under another scope reads
   * as empty and is never written over; a page whose scope changes sends
   * nothing it read for the old one, and reads the new one's.
   */
  readonly scope: (model: AppModel) => string
  /** The wait between sends nothing answered: 1 second doubling to 30, unless given. */
  readonly retry?: RetryOptions | undefined
}

/** `outbox`'s wiring, and the restore its runtime's `init` starts from. */
export interface OutboxWiring<AppModel> extends Wiring<
  AppModel,
  RemoteMessage,
  KeyValueStore.KeyValueStore | RemoteClient
> {
  /**
   * The Model with the stored queue under its `key` read back, as the wiring
   * would read it, and this page's session minted. Resolve it as the runtime's
   * `flags` and start `init` from it: a durable write needs the session, and
   * the first frame then shows the waiting writes.
   */
  readonly restore: (model: AppModel) => Effect.Effect<AppModel, never, KeyValueStore.KeyValueStore>
}

/**
 * Keeps a domain's durable writes (`mutate`'s `durable`) across a reload and
 * sends them, as a wiring beside `Data.wiring`: the queue is written to `key`
 * before a write is sent, sent oldest first by one tab (a Web Lock), sent
 * again after a failure that nothing answered with a backoff, and read back
 * by every tab. Start `init` from its `restore`. A change of principal should
 * `forget` in `update`, and name another `key`.
 */
export const outbox = <AppModel>(
  domain: OutboxDomain<AppModel>,
  options: OutboxOptions<AppModel>,
): OutboxWiring<AppModel> => {
  /** The descriptor a stored write names, which `readEntries` found registered. */
  const registered = (name: string): MutationDescriptor<any, any, any> => {
    const descriptor = domain.registry.mutations.get(name)
    if (descriptor === undefined) {
      throw new Error(
        `Remote: a durable write names mutation "${name}", which domain "${domain.contract.name}" does not register`,
      )
    }
    return descriptor
  }
  /** How this version reads a stored input of `mutation`; none for one it does not register. */
  const inputOf = (mutation: string) =>
    Option.map(
      Option.fromUndefinedOr(domain.registry.mutations.get(mutation)),
      descriptor => (input: unknown) =>
        Option.map(Schema.decodeUnknownOption(descriptor.Input)(input), decoded => ({
          decoded,
        })),
    )
  const readOf = (
    key: string,
    scope: string,
    stored: StoredOutbox,
    extra: { readonly session?: string; readonly unsaved?: string } = {},
  ): RemoteMessage => ({
    _tag: 'OutboxRead',
    key,
    scope,
    entries: readEntries(stored, inputOf),
    done: stored.done,
    ...extra,
  })
  /** Tells the other tabs on `key` the store changed, with the answer that changed it. */
  const announce = (key: string, outcome: Option.Option<RemoteMessage>) =>
    Effect.sync(() =>
      Option.map(channelFor(key), channel => {
        channel.postMessage({ outcome: Option.getOrUndefined(outcome) })
        channel.close()
      }),
    )
  /** The store with `change` merged in, under its lock, so two tabs never write it at once. */
  const writeStored = (key: string, scope: string, change: StoredOutbox) =>
    withLock(
      storeLock(key),
      Effect.gen(function* () {
        // Another scope's waiting writes are never written over: a key that
        // is not one per principal fails the save, and says why.
        if (yield* othersWaiting(key, scope)) {
          return yield* Effect.fail(
            new Error(
              `the store under ${key} holds another scope's waiting writes; give each principal a key of its own`,
            ),
          )
        }
        const merged = mergeStored(yield* readStored(key, scope), change)
        const kv = yield* KeyValueStore.KeyValueStore
        yield* kv.set(key, storedText(merged, scope))
        return merged
      }),
    )
  /** What the store holds, as a page reads it; this page's own queue, and why, where it cannot be read. */
  const restored = (key: string, scope: string, session: Option.Option<string>) =>
    readStored(key, scope).pipe(
      Effect.map(stored =>
        readOf(
          key,
          scope,
          stored,
          Option.match(session, {
            onNone: () => ({}),
            onSome: minted => ({ session: minted }),
          }),
        ),
      ),
      Effect.catch(error =>
        Effect.succeed(
          readOf(
            key,
            scope,
            { entries: [], done: [] },
            {
              ...Option.match(session, {
                onNone: () => ({}),
                onSome: minted => ({ session: minted }),
              }),
              unsaved: error.message,
            },
          ),
        ),
      ),
    )
  /** Whether the page's queue is the one stored under `key` for `scope`. */
  const holding = (outbox: RemoteModel['outbox'], key: string, scope: string) =>
    Option.contains(outbox.key, key) && Option.contains(outbox.scope, scope)
  const minted = (has: boolean) =>
    has ? Effect.succeed(Option.none<string>()) : Effect.sync(() => Option.some(mintOperation()))

  // The queue's text changes only with the queue and the scope, so it is kept by them.
  let lastText: {
    readonly outbox: RemoteModel['outbox'] | undefined
    readonly scope: string
    readonly text: string
  } = { outbox: undefined, scope: '', text: '' }
  const textOf = (outbox: RemoteModel['outbox'], scope: string): string => {
    if (lastText.outbox !== outbox || lastText.scope !== scope) {
      lastText = { outbox, scope, text: storedText(storedOf(outbox), scope) }
    }
    return lastText.text
  }

  const restoreEntry: EntryWithoutKeepAlive<
    AppModel,
    RemoteMessage,
    {
      readonly key: string
      readonly scope: string
      readonly restored: boolean
      readonly session: boolean
    },
    KeyValueStore.KeyValueStore
  > = {
    dependenciesSchema: Schema.Struct({
      key: Schema.String,
      scope: Schema.String,
      restored: Schema.Boolean,
      session: Schema.Boolean,
    }),
    modelToDependencies: model => {
      const { outbox } = domain.store.get(model)
      const key = options.key(model)
      const scope = options.scope(model)
      return {
        key,
        scope,
        restored: holding(outbox, key, scope),
        session: Option.isSome(outbox.session),
      }
    },
    dependenciesToStream: ({ key, scope, restored: done, session }) =>
      done
        ? Stream.empty
        : Stream.fromEffect(Effect.flatMap(minted(session), mint => restored(key, scope, mint))),
  }

  // Written whenever the queue changes, merged with what other tabs wrote,
  // and read back: what the store holds is what may be sent.
  const save: EntryWithoutKeepAlive<
    AppModel,
    RemoteMessage,
    { readonly key: string; readonly scope: string; readonly text: Option.Option<string> },
    KeyValueStore.KeyValueStore
  > = {
    dependenciesSchema: Schema.Struct({
      key: Schema.String,
      scope: Schema.String,
      text: Schema.OptionFromNullOr(Schema.String),
    }),
    modelToDependencies: model => {
      const { outbox } = domain.store.get(model)
      const key = options.key(model)
      const scope = options.scope(model)
      return {
        key,
        scope,
        // Saved only under the key and scope it was read for: never over a queue not yet read.
        text: holding(outbox, key, scope) ? Option.some(textOf(outbox, scope)) : Option.none(),
      }
    },
    dependenciesToStream: ({ key, scope, text }) =>
      Option.match(text, {
        onNone: () => Stream.empty,
        onSome: written => {
          const mine = storedFromText(written)
          return Stream.fromEffect(
            writeStored(key, scope, mine).pipe(
              Effect.tap(() => announce(key, Option.none())),
              Effect.map(merged => readOf(key, scope, merged)),
              // A store that cannot be written does not hold the writes back:
              // they are sent, and a reload before the answer loses them.
              Effect.catch(error =>
                Effect.succeed(readOf(key, scope, mine, { unsaved: error.message })),
              ),
            ),
          )
        },
      }),
  }

  /** Sends `write`, as the one tab on `key` that sends, until the server answers it. */
  const sent = (key: string, scope: string, write: StoredWrite) =>
    Stream.callback<RemoteMessage, never, KeyValueStore.KeyValueStore | RemoteClient>(queue => {
      const emit = (message: RemoteMessage) => Queue.offer(queue, message)
      /**
       * The outcome told this tab and the others first, so each settles
       * with the server's answer, then written to the store before the
       * lock goes, so the next sender reads it.
       */
      const settle = (message: RemoteMessage, change: StoredOutbox) =>
        emit(message).pipe(
          Effect.andThen(announce(key, Option.some(message))),
          Effect.andThen(writeStored(key, scope, change)),
          Effect.andThen(announce(key, Option.none())),
          // Unwritten, the store still says waiting: the next sender sends it
          // again, and the operation id has the server answer from its record.
          Effect.ignore,
        )
      const operation = write.operation
      return withLock(
        sendLock(key),
        Effect.gen(function* () {
          // Another tab may have settled it while this one waited for the lock.
          const there = yield* Effect.option(readStored(key, scope))
          if (Option.isSome(there) && settledIn(there.value, operation)) {
            yield* emit(readOf(key, scope, there.value))
            return
          }
          const mutation = registered(write.mutation)
          const input = Schema.decodeUnknownSync(mutation.Input)(write.input)
          for (let attempt = 1; ; attempt++) {
            const result = yield* Effect.result(
              mutateRemote(mutation, input, operation, {
                keys: write.keys,
                operation,
                shown: write.shown,
                now: write.now,
              }),
            )
            if (Result.isSuccess(result)) {
              const outcome = result.success
              const at = yield* Clock.currentTimeMillis
              return yield* settle(
                {
                  _tag: 'MutationSucceeded',
                  requestId: operation,
                  entities: outcome.entities,
                  connections: outcome.connections,
                  deleted: outcome.deleted,
                  ...(outcome.read === undefined ? {} : { read: outcome.read }),
                  now: at,
                },
                { entries: [], done: [operation] },
              )
            }
            const error = remoteError(result.failure)
            // Nothing answered: kept waiting, and sent again after a wait.
            if (result.failure._tag === 'Unreachable') {
              yield* emit({ _tag: 'OutboxDelayed', requestId: operation, attempt, error })
              yield* Effect.race(
                Effect.flatMap(backoff(attempt, options.retry), Effect.sleep),
                onlineAgain,
              )
              continue
            }
            return yield* settle(
              { _tag: 'MutationFailed', requestId: operation, error, operation },
              {
                entries: [
                  { ...write, revision: write.revision + 1, state: { _tag: 'Failed', error } },
                ],
                done: [],
              },
            )
          }
        }),
      ).pipe(Effect.ensuring(Queue.end(queue)))
    })

  // The head's text changes only with the head, so a send is not restarted
  // by anything else the Model does while it waits for its answer.
  let lastHead: {
    readonly outbox: RemoteModel['outbox'] | undefined
    readonly head: Option.Option<string>
  } = { outbox: undefined, head: Option.none() }
  const headTextOf = (outbox: RemoteModel['outbox']): Option.Option<string> => {
    if (lastHead.outbox !== outbox) {
      lastHead = { outbox, head: Option.map(headOf(outbox), write => JSON.stringify(write)) }
    }
    return lastHead.head
  }
  const send: EntryWithoutKeepAlive<
    AppModel,
    RemoteMessage,
    { readonly key: string; readonly scope: string; readonly head: Option.Option<string> },
    KeyValueStore.KeyValueStore | RemoteClient
  > = {
    dependenciesSchema: Schema.Struct({
      key: Schema.String,
      scope: Schema.String,
      head: Schema.OptionFromNullOr(Schema.String),
    }),
    modelToDependencies: model => {
      const { outbox } = domain.store.get(model)
      const key = options.key(model)
      const scope = options.scope(model)
      return {
        key,
        scope,
        // Another scope's queue is never sent: it was made as someone else.
        head: holding(outbox, key, scope) ? headTextOf(outbox) : Option.none(),
      }
    },
    dependenciesToStream: ({ key, scope, head }) =>
      Option.match(head, {
        onNone: () => Stream.empty,
        onSome: text => sent(key, scope, Schema.decodeUnknownSync(StoredWrite)(JSON.parse(text))),
      }),
  }

  /** What another tab announced: the answer it heard first, then the store as it now is. */
  const heard = (key: string, scope: string, data: unknown) =>
    Effect.map(restored(key, scope, Option.none()), (read): ReadonlyArray<RemoteMessage> => [
      ...Option.toArray(outcomeOf(data)),
      read,
    ])
  const watch: EntryWithoutKeepAlive<
    AppModel,
    RemoteMessage,
    { readonly key: string; readonly scope: string; readonly restored: boolean },
    KeyValueStore.KeyValueStore
  > = {
    dependenciesSchema: Schema.Struct({
      key: Schema.String,
      scope: Schema.String,
      restored: Schema.Boolean,
    }),
    modelToDependencies: model => {
      const key = options.key(model)
      const scope = options.scope(model)
      return {
        key,
        scope,
        restored: holding(domain.store.get(model).outbox, key, scope),
      }
    },
    dependenciesToStream: ({ key, scope, restored: read }) =>
      read
        ? Stream.callback<unknown>(queue =>
            Effect.acquireRelease(
              Effect.sync(() =>
                Option.map(channelFor(key), channel => {
                  channel.onmessage = (event: MessageEvent<unknown>) => {
                    Queue.offerUnsafe(queue, event.data)
                  }
                  return channel
                }),
              ),
              channel => Effect.sync(() => Option.map(channel, open => open.close())),
            ),
          ).pipe(
            Stream.mapEffect(data => heard(key, scope, data)),
            Stream.flatMap(messages => Stream.fromIterable(messages)),
          )
        : Stream.empty,
  }

  return {
    key: `outbox:${domain.contract.name}`,
    handles: [],
    subscriptions: Subscription.make<
      AppModel,
      RemoteMessage,
      KeyValueStore.KeyValueStore | RemoteClient
    >()(() => ({
      'outbox.restore': restoreEntry,
      'outbox.save': save,
      'outbox.send': send,
      'outbox.watch': watch,
    })),
    restore: model =>
      Effect.map(
        Effect.flatMap(minted(Option.isSome(domain.store.get(model).outbox.session)), mint =>
          restored(options.key(model), options.scope(model), mint),
        ),
        message => domain.reduce(model, message),
      ),
  }
}

/** The outbox's own answers, as another tab announced them: a settled write, and nothing else. */
const announcedOutcome = Schema.Struct({ outcome: Schema.optional(remoteMessageSchema) })
const outcomeOf = (data: unknown): Option.Option<RemoteMessage> =>
  Option.filter(
    Option.flatMap(Schema.decodeUnknownOption(announcedOutcome)(data), ({ outcome }) =>
      Option.fromUndefinedOr(outcome),
    ),
    outcome => outcome._tag === 'MutationSucceeded' || outcome._tag === 'MutationFailed',
  )

/** One item of `outboxStatus`. */
export interface OutboxItem {
  readonly requestId: string
  /** The Mutation it names; none where the stored entry names none this version can read. */
  readonly mutation: Option.Option<string>
  readonly state: OutboxItemState
}

export type OutboxItemState = Data.TaggedEnum<{
  /** Not answered yet: `attempt` sends nothing answered so far, `error` the last one's. */
  Waiting: { readonly attempt: number; readonly error: Option.Option<RemoteError> }
  /** The server answered no: `Data.retry` or `Data.dismiss` it. */
  Failed: { readonly error: RemoteError }
  /** Stored by a version of the app this one cannot read: `Data.dismiss` it. */
  Unreadable: { readonly reason: string }
}>
export const OutboxItemState = Data.taggedEnum<OutboxItemState>()

/** What the outbox holds, for a view: "3 changes waiting". */
export interface OutboxStatus {
  readonly waiting: number
  readonly failed: number
  /** Every durable write not yet settled, in the order they are sent. */
  readonly items: ReadonlyArray<OutboxItem>
}

const MutationName = Schema.Struct({ mutation: Schema.String })

/**
 * The durable writes a domain has not yet settled, every tab's, in the order
 * the outbox sends them: how many wait, how many the server refused, and each
 * one's state, for a "3 changes waiting" line.
 */
export const outboxStatus = <AppModel>(
  domain: { readonly store: { get(model: AppModel): RemoteModel } },
  model: AppModel,
): OutboxStatus => statusOf(domain.store.get(model).outbox)

const statusOf = (outbox: OutboxState): OutboxStatus => {
  const items = outbox.queue.map(
    Queued.$match({
      Readable: ({ write, attempt, delayed }): OutboxItem => ({
        requestId: write.operation,
        mutation: Option.some(write.mutation),
        state:
          write.state._tag === 'Waiting'
            ? OutboxItemState.Waiting({ attempt, error: delayed })
            : OutboxItemState.Failed({ error: write.state.error }),
      }),
      Unreadable: ({ operation, raw, reason }): OutboxItem => ({
        requestId: operation,
        mutation: Option.map(
          Schema.decodeUnknownOption(MutationName)(raw),
          ({ mutation }) => mutation,
        ),
        state: OutboxItemState.Unreadable({ reason }),
      }),
    }),
  )
  return {
    waiting: items.filter(item => item.state._tag === 'Waiting').length,
    failed: items.filter(item => item.state._tag === 'Failed').length,
    items,
  }
}
