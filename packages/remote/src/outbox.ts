/**
 * `foldkit-remote/outbox`: durable writes (`Data.mutate`'s `durable`) kept
 * across a reload and sent in order by one tab (#247). An entry of its own
 * (#378), so a page with no outbox keeps none of its store, locks or sending.
 */
import { Clock, Effect, Match, Option, Queue, Result, Schema, Stream } from 'effect'
import { KeyValueStore } from 'effect/persistence'
import * as Subscription from 'foldkit/subscription'
import type { EntryWithoutKeepAlive } from 'foldkit/subscription'
import type { Wiring } from 'foldkit-surface'
import {
  defectAsFailure,
  mintOperation,
  mutateRemote,
  remoteError,
  type RemoteClient,
} from './client.js'
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
  answeredIn,
  sendLock,
  storedFromText,
  storedOf,
  storedText,
  moveLock,
  storeLock,
  storedChange,
  StoredWrite,
  emptyStoredOutbox,
  withLock,
  type RetryOptions,
  type StoredOutbox,
} from './outboxStore.js'
import { madeAsOf, Queued, signedKey, type MadeAs, type OutboxState } from './queue.js'
import { heldFrom } from './outboxStatus.js'

export type { RetryOptions } from './outboxStore.js'
export {
  OutboxItemState,
  outboxStatus,
  type OutboxItem,
  type OutboxStatus,
} from './outboxStatus.js'

/** What `outbox` and `outboxStatus` use of a domain: `Remote.make`'s value is one. */
export interface OutboxDomain<AppModel> {
  readonly registry: {
    readonly mutations: ReadonlyMap<string, MutationDescriptor<any, any, any>>
  }
  readonly store: {
    get(model: AppModel): RemoteModel
    set(model: AppModel, remote: RemoteModel): AppModel
  }
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
  /**
   * The Model with this page's session minted, and nothing read: what a page
   * resumed from a server render starts from (`SSR.hydrate`'s `prepare`),
   * since the server cannot read the store and the first client view must be
   * the served page. A durable write can then be made at once; the stored
   * queue arrives after the first frame, as an `OutboxRead`, and keeps it.
   */
  readonly session: (model: AppModel) => Effect.Effect<AppModel>
}

/**
 * Keeps a domain's durable writes (`mutate`'s `durable`) across a reload and
 * sends them, as a wiring beside `Data.wiring`: the queue is written to `key`
 * before a write is sent, sent oldest first by one tab (a Web Lock), sent
 * again after a failure that nothing answered with a backoff, and read back
 * by every tab. Start `init` from its `restore`, or a page resumed from a
 * server render from its `session`. A change of principal should
 * `forget` in `update`, and name another `key`. Each write is sent naming
 * whom the server last said it answered as when it was queued, and the
 * server runs it for no one else: one made for someone other than whom an
 * answer names is held (`OutboxHeld`), and a visitor's is stamped as, and
 * moved to the queue of, whoever signs in first (`OutboxMoved`, #405). Whom
 * the page heard is saved with the queue, for a reload.
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
    ...Option.match(stored.owner, { onNone: () => ({}), onSome: owner => ({ owner }) }),
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
  /**
   * `change` written to the store, the other tabs told, and the store read
   * back; where it cannot be written, `change` itself and why. A store that
   * cannot be written does not hold the writes back: they are sent, and a
   * reload before the answer loses them.
   */
  const saved = (key: string, scope: string, change: StoredOutbox) =>
    writeStored(key, scope, change).pipe(
      Effect.tap(() => announce(key, Option.none())),
      Effect.map(merged => readOf(key, scope, merged)),
      Effect.catch(error => Effect.succeed(readOf(key, scope, change, { unsaved: error.message }))),
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
          readOf(key, scope, emptyStoredOutbox, {
            ...Option.match(session, {
              onNone: () => ({}),
              onSome: minted => ({ session: minted }),
            }),
            unsaved: error.message,
          }),
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
        onSome: written => Stream.fromEffect(saved(key, scope, storedFromText(written))),
      }),
  }

  /** Sends `write`, as the one tab on `key` that sends, until the server answers it. */
  const sent = (key: string, scope: string, write: StoredWrite, generation: number) =>
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
          // Another tab may have had it answered while this one waited for the lock.
          const there = yield* Effect.option(readStored(key, scope))
          if (Option.isSome(there) && answeredIn(there.value, operation)) {
            yield* emit(readOf(key, scope, there.value))
            return
          }
          const mutation = registered(write.mutation)
          const input = Schema.decodeUnknownSync(mutation.Input)(write.input)
          for (let attempt = 1; ; attempt++) {
            const result = yield* Effect.result(
              defectAsFailure(
                mutateRemote(mutation, input, operation, {
                  keys: write.keys,
                  operation,
                  shown: write.shown,
                  lists: write.lists,
                  now: write.now,
                  principal: expectedOf(write.madeAs),
                }),
              ),
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
                  ...(outcome.lists === undefined ? {} : { lists: outcome.lists }),
                  ...(outcome.principal === undefined
                    ? {}
                    : { principal: madeAsOf(outcome.principal), generation }),
                  now: at,
                },
                storedChange([], [operation]),
              )
            }
            const error = remoteError(result.failure)
            const next = Match.value(result.failure).pipe(
              Match.tags({
                Unauthenticated: () => 'waitForSignIn' as const,
                // Made for someone else than who is signed in: kept for them (#405).
                PrincipalChanged: () => 'waitForSignIn' as const,
                Unreachable: () => 'sendAgain' as const,
              }),
              Match.orElse(() => 'settle' as const),
            )
            // No one is signed in to send it as, or someone else is: kept,
            // with every write after it, until `Data.signedIn`. Not settled,
            // so no tab is told an outcome: each reads the state from the
            // store (#403, #405).
            if (next === 'waitForSignIn') {
              const waiting = {
                ...write,
                revision: write.revision + 1,
                state: { _tag: 'WaitingForSignIn', error },
              } as const
              return yield* Effect.flatMap(saved(key, scope, storedChange([waiting], [])), emit)
            }
            // Nothing answered: kept waiting, and sent again after a wait.
            if (next === 'sendAgain') {
              yield* emit({ _tag: 'OutboxDelayed', requestId: operation, attempt, error })
              yield* Effect.race(
                Effect.flatMap(backoff(attempt, options.retry), Effect.sleep),
                onlineAgain,
              )
              continue
            }
            return yield* settle(
              { _tag: 'MutationFailed', requestId: operation, error, operation },
              storedChange(
                [{ ...write, revision: write.revision + 1, state: { _tag: 'Failed', error } }],
                [],
              ),
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
    {
      readonly key: string
      readonly scope: string
      readonly head: Option.Option<string>
      readonly generation: number
    },
    KeyValueStore.KeyValueStore | RemoteClient
  > = {
    dependenciesSchema: Schema.Struct({
      key: Schema.String,
      scope: Schema.String,
      head: Schema.OptionFromNullOr(Schema.String),
      generation: Schema.Number,
    }),
    modelToDependencies: model => {
      const { outbox, refresh } = domain.store.get(model)
      const key = options.key(model)
      const scope = options.scope(model)
      return {
        key,
        scope,
        // Another scope's queue is never sent: it was made as someone else.
        head: holding(outbox, key, scope) ? headTextOf(outbox) : Option.none(),
        // Whom its answer was for is heard only while no `forget` came between.
        generation: refresh.floor,
      }
    },
    dependenciesToStream: ({ key, scope, head, generation }) =>
      Option.match(head, {
        onNone: () => Stream.empty,
        onSome: text =>
          sent(key, scope, Schema.decodeUnknownSync(StoredWrite)(JSON.parse(text)), generation),
      }),
  }

  /**
   * The writes in the `from` queue no one has claimed moved to the `to`
   * queue, made for `key` from then on, and the report of them; nothing where
   * none wait there. Out of another queue, a visitor's alone; in place (`from`
   * is `to`: the cookie named someone while the scope stayed), a visitor's
   * and those made before any answer said who. Written to `to` before they
   * leave `from`, so a page closed between loses none, and a second move
   * finds them gone. One tab at a time moves from a queue, so the report is
   * said once.
   */
  const moved = (
    from: { readonly key: string; readonly scope: string },
    to: { readonly key: string; readonly scope: string },
    key: string,
  ) =>
    withLock(
      moveLock(from.key),
      Effect.gen(function* () {
        const inPlace = from.key === to.key && from.scope === to.scope
        const there = yield* readStored(from.key, from.scope)
        // Never out of a queue someone signed in owns, unless in place for them:
        // a dropped cookie under Ada's scope does not make her writes anyone's.
        const claimable = Option.match(there.owner, {
          onNone: () => true,
          onSome: owner =>
            Match.valueTags(owner, {
              Visitor: () => true,
              Signed: ({ key: own }) => inPlace && own === key,
            }),
        })
        if (!claimable) return []
        const unclaimed = there.entries.flatMap(raw =>
          Option.toArray(
            Option.filter(
              Schema.decodeUnknownOption(StoredWrite)(raw),
              write =>
                write.state._tag !== 'Failed' &&
                (inPlace ? write.madeAs?._tag !== 'Signed' : write.madeAs?._tag === 'Visitor'),
            ),
          ),
        )
        if (unclaimed.length === 0) return []
        const signed = { _tag: 'Signed', key } as const
        const merged = yield* writeStored(
          to.key,
          to.scope,
          storedChange(
            unclaimed.map(write => ({
              ...write,
              madeAs: signed,
              // Past any one change another tab makes to it meanwhile (a send
              // of it refused), so the store keeps the stamp.
              revision: write.revision + 2,
              state: { _tag: 'Waiting' } as const,
            })),
            [],
          ),
        )
        const requestIds = unclaimed.map(write => write.operation)
        if (!inPlace) {
          yield* writeStored(from.key, from.scope, storedChange([], requestIds))
          yield* announce(from.key, Option.none())
        }
        yield* announce(to.key, Option.none())
        return [
          { _tag: 'OutboxMoved', requestIds, from: from.scope, to: to.scope } as const,
          readOf(to.key, to.scope, merged),
        ]
      }),
    ).pipe(
      // A store that cannot be read or written moves nothing: the writes wait
      // where they are, and the next sign-in moves them.
      Effect.catch(() => Effect.succeed([])),
    )
  const adopt: EntryWithoutKeepAlive<
    AppModel,
    RemoteMessage,
    {
      readonly key: string
      readonly scope: string
      readonly from: Option.Option<{ readonly key: string; readonly scope: string }>
      readonly unclaimed: ReadonlyArray<string>
      readonly principal: Option.Option<string>
    },
    KeyValueStore.KeyValueStore
  > = {
    dependenciesSchema: Schema.Struct({
      key: Schema.String,
      scope: Schema.String,
      from: Schema.OptionFromNullOr(Schema.Struct({ key: Schema.String, scope: Schema.String })),
      unclaimed: Schema.Array(Schema.String),
      principal: Schema.OptionFromNullOr(Schema.String),
    }),
    modelToDependencies: model => {
      const { outbox } = domain.store.get(model)
      const key = options.key(model)
      const scope = options.scope(model)
      const held = holding(outbox, key, scope)
      return {
        key,
        scope,
        // Only into the queue the page holds, from the one it held before
        // (the same one, where the scope did not move: then it is in place).
        from: held ? outbox.left : Option.none(),
        // The stored writes of the queue it holds that no one has claimed.
        unclaimed: held ? unclaimedIn(outbox) : [],
        principal: Option.flatMap(outbox.principal, signedKey),
      }
    },
    dependenciesToStream: ({ key, scope, from, unclaimed, principal }) =>
      Option.match(principal, {
        onNone: () => Stream.empty,
        onSome: signed => {
          const here = { key, scope }
          const moves = [
            ...Option.toArray(Option.map(from, left => moved(left, here, signed))),
            ...(unclaimed.length === 0 ? [] : [moved(here, here, signed)]),
          ]
          return Stream.flatMap(
            Stream.fromEffect(Effect.map(Effect.all(moves), all => all.flat())),
            messages => Stream.fromIterable(messages),
          )
        },
      }),
  }

  // Writes made for someone other than whom an answer names now are not sent,
  // and each page that hears so says so once.
  const hold: EntryWithoutKeepAlive<
    AppModel,
    RemoteMessage,
    { readonly scope: string; readonly held: ReadonlyArray<string> },
    never
  > = {
    dependenciesSchema: Schema.Struct({ scope: Schema.String, held: Schema.Array(Schema.String) }),
    modelToDependencies: model => {
      const { outbox } = domain.store.get(model)
      const key = options.key(model)
      const scope = options.scope(model)
      return { scope, held: holding(outbox, key, scope) ? heldIn(outbox) : [] }
    },
    dependenciesToStream: ({ scope, held }) =>
      held.length === 0
        ? Stream.empty
        : Stream.succeed<RemoteMessage>({ _tag: 'OutboxHeld', requestIds: held, scope }),
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
      'outbox.adopt': adopt,
      'outbox.hold': hold,
    })),
    session: model =>
      Effect.sync(() => {
        const remote = domain.store.get(model)
        return domain.store.set(model, {
          ...remote,
          outbox: { ...remote.outbox, session: Option.some(mintOperation()) },
        })
      }),
    restore: model =>
      Effect.map(
        Effect.flatMap(minted(Option.isSome(domain.store.get(model).outbox.session)), mint =>
          restored(options.key(model), options.scope(model), mint),
        ),
        message => domain.reduce(model, message),
      ),
  }
}

/** The operations of the readable, unsettled writes of `outbox` that `pick` takes. */
const operationsIn = (
  outbox: OutboxState,
  pick: (write: StoredWrite, stored: boolean) => boolean,
): ReadonlyArray<string> =>
  outbox.queue.flatMap(
    Queued.$match({
      Readable: ({ write, stored }) => {
        if (write.state._tag === 'Failed' || !pick(write, stored)) return []
        return [write.operation]
      },
      Unreadable: () => [],
    }),
  )

/** The stored writes of `outbox` stamped for no one in particular: a visitor's, or unstamped. */
const unclaimedIn = (outbox: OutboxState): ReadonlyArray<string> =>
  operationsIn(outbox, (write, stored) => stored && write.madeAs?._tag !== 'Signed')

/** The writes of `outbox` made for someone other than whom the page heard last. */
const heldIn = (outbox: OutboxState): ReadonlyArray<string> =>
  operationsIn(outbox, write => heldFrom(write, outbox))

/** What a write sends as whom it was made for: a key, `null` a visitor, nothing before any answer said. */
const expectedOf = (madeAs: MadeAs | undefined): string | null | undefined =>
  madeAs === undefined
    ? undefined
    : Match.valueTags(madeAs, {
        Visitor: () => null,
        Signed: ({ key }) => key,
      })

/** The outbox's own answers, as another tab announced them: a settled write, and nothing else. */
const announcedOutcome = Schema.Struct({ outcome: Schema.optional(remoteMessageSchema) })
const outcomeOf = (data: unknown): Option.Option<RemoteMessage> =>
  Option.filter(
    Option.flatMap(Schema.decodeUnknownOption(announcedOutcome)(data), ({ outcome }) =>
      Option.fromUndefinedOr(outcome),
    ),
    outcome => outcome._tag === 'MutationSucceeded' || outcome._tag === 'MutationFailed',
  )
