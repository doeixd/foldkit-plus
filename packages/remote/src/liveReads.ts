/**
 * The live capability (#378): the stream a live entry runs, and what its
 * events do to the Model. A live read (`foldkit-remote/live`) installs it, with
 * the layer capability a live insert needs, so a page that reads nothing live
 * keeps none of it.
 */
import { Duration, Effect, Option, Stream } from 'effect'
import type { Install, LiveCapability } from './capability.js'
import { RemoteClient, remoteError } from './client.js'
import type { LiveOptions } from './index.js'
import type { ConnectionSpec } from './query.js'
import { installLayers } from './layers.js'
import { applyConnectionEvent, applyEntityEvent } from './liveEvents.js'
import { liveStreamKey } from './liveState.js'
import { belongsEncoded } from './matching.js'
import { entityKey } from './store.js'
import type {
  RemoteLiveError,
  RemoteLiveRefused,
  RemoteProtocolError,
  RemoteUnauthenticated,
} from './wire.js'

/** The wait before a stream's restart after `failures` breaks in a row: Sync's transport backoff. */
const restartDelay = (options: LiveOptions, failures: number): Duration.Duration => {
  const base = Duration.toMillis(Duration.fromInputUnsafe(options.retryBase ?? '50 millis'))
  const max = Duration.toMillis(Duration.fromInputUnsafe(options.maxRetryDelay ?? '5 seconds'))
  const backoff = Math.min(max, base * 2 ** Math.min(Math.max(failures, 1) - 1, 30))
  return Duration.millis(backoff * (0.8 + Math.random() * 0.4))
}

const wallClock = (): number => Date.now()

/**
 * What to do with a row a live event says was inserted into a connection.
 *
 * Resolved where the domain reduces, the only place with both the Model and
 * the registry.
 *
 * **The declared policy reaches the decision.** `Query.connection(E, { live })`
 * is carried on the descriptor and put on the Message here, so a live insert
 * takes what the application asked for.
 *
 * **A row the client can judge does not need a policy.** The policy exists
 * because nothing could tell whether an inserted row belonged to the query.
 * Where the body says it does not, `ignore` is not a guess. Where the body
 * says it does, or the client cannot tell — a row it never fetched, or holds
 * without a field the body reads — the declared policy is the answer.
 *
 * Only membership is decided here. *Where* a row sorts needs text collation,
 * which is the backend's, so the position the event carries stands.
 */
const policy: LiveCapability['policy'] = (lists, visible, event, context) => {
  if (event._tag !== 'ConnectionInsert') return undefined
  return Option.match(lists.queryOf(event.connection), {
    onNone: () => undefined,
    onSome: ({ descriptor, encoded }) => {
      const declared = (descriptor.Result as Partial<ConnectionSpec> | undefined)?.live
      if (descriptor.body === undefined) return declared
      const decided = belongsEncoded(
        visible,
        descriptor,
        encoded,
        entityKey(event.edge.ref.entity, event.edge.ref.id),
        lists.operators,
        context,
      )
      return decided === 'no' ? { prepend: 'ignore', append: 'ignore' } : declared
    },
  })
}

const stream: LiveCapability['stream'] = (
  { requirements, queries, cursor, restarts, failures },
  toMessage,
  options,
) => {
  const key = liveStreamKey({ requirements, queries })
  const live = Stream.unwrap(
    Effect.gen(function* () {
      const client = yield* RemoteClient
      return client.live({ requirements, queries, after: cursor })
    }),
  ).pipe(
    Stream.map(event =>
      toMessage({
        _tag: 'LiveReceived',
        stream: key,
        event,
        now: (options.now ?? wallClock)(),
      }),
    ),
    Stream.catchIf(
      (
        _error,
      ): _error is
        | RemoteLiveError
        | RemoteLiveRefused
        | RemoteProtocolError
        | RemoteUnauthenticated => true,
      error =>
        Stream.succeed(
          toMessage({
            _tag: 'ReadFailed',
            requests: requirements,
            error: remoteError(error),
            stream: key,
          }),
        ),
    ),
  )
  if (restarts === 0) return live
  // The server replays nothing a stream missed while it was down, so a
  // restart refetches what the stream covers. The gap closes before the
  // resubscribe, so a resubscribe that fails is a break of its own; were the
  // two concurrent, its failure could land on the open gap and be ignored,
  // and the late `GapCleared` would leave the stream stopped.
  return Stream.fromEffect(Effect.sleep(restartDelay(options, failures))).pipe(
    Stream.drain,
    Stream.concat(
      Stream.make(
        toMessage({ _tag: 'RefreshStarted', requests: requirements }),
        toMessage({ _tag: 'GapCleared', stream: key }),
      ),
    ),
    Stream.concat(live),
  )
}

export const liveReads: LiveCapability = {
  applyEntity: applyEntityEvent,
  applyConnection: applyConnectionEvent,
  policy,
  stream,
}

/** Installs live reads, and the layers a live insert shows. */
export const installLive: Install = capabilities => {
  installLayers(capabilities)
  capabilities.live = Option.some(liveReads)
}
