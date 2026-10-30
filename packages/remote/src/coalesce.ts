/**
 * Read coalescing: every requirement a client asks for goes through one
 * `RequestResolver`, so requirements issued together become one `ReadBatch`
 * (ids batched, fields unioned), cut to the server's limits, and a
 * requirement already in flight is joined rather than re-requested. A call
 * in flight that no caller waits on any more is interrupted. The planner
 * stays pure; this is the transport seam's concern, and the store is still
 * the only cache.
 */
import {
  Deferred,
  Duration,
  Effect,
  Layer,
  Request,
  RequestResolver,
  type Fiber,
  type Schema,
} from 'effect'
import { RemoteClient } from './client.js'
import { withDeadline } from './deadline.js'
import { Requirement, type RelationRequirement } from './requirement.js'
import { stableStringify } from './query.js'
import {
  REMOTE_PROTOCOL_VERSION,
  RemoteMutationError,
  RemoteQueryError,
  RemoteReadError,
  RemoteUnreachable,
  type QueryRequest,
  type QueryResult,
  type ReadBatch,
  type ReadBatchResult,
} from './wire.js'
import type { RemoteProtocolError, RemoteUnauthenticated } from './wire.js'

type Batch = Schema.Schema.Type<typeof ReadBatch>
type BatchResult = Schema.Schema.Type<typeof ReadBatchResult>
type ReadError = RemoteReadError | RemoteProtocolError | RemoteUnauthenticated | RemoteUnreachable
type QueryError = RemoteQueryError | RemoteUnauthenticated | RemoteUnreachable
export type BatchRead = (batch: Batch) => Effect.Effect<BatchResult, ReadError>
type QueryRequestValue = Schema.Schema.Type<typeof QueryRequest>
type QueryResultValue = Schema.Schema.Type<typeof QueryResult>
export type QueryRun = (request: QueryRequestValue) => Effect.Effect<QueryResultValue, QueryError>

/** What `Remote.clientLayer` and `Remote.coalesced` do around a transport. */
export interface ClientOptions {
  /**
   * How long a batch waits to collect more requirements before it runs.
   * Requirements issued concurrently coalesce even at the default of no wait.
   */
  readonly window?: Duration.Input | undefined
  /**
   * How long a read, a query or a mutation waits for its answer; default no
   * limit. One that runs out fails `RemoteUnreachable`: a read or a query is
   * retried like any failed read, and a durable mutation, which may have
   * reached the server, is sent again under the same operation id.
   */
  readonly timeout?: Duration.Input | undefined
  /**
   * The server's `maxIdsPerEntity`: a batch naming more ids of one Entity is
   * cut into reads of at most this many. Default 1000, the server's default.
   */
  readonly maxIdsPerEntity?: number | undefined
  /**
   * The server's `maxBodyBytes`: a read whose request would be larger is cut,
   * and a query or mutation that would be is refused without being sent.
   * Default 1 MiB, the server's default.
   */
  readonly maxBodyBytes?: number | undefined
}

/** The defaults `serveFetch` and `RemoteServer.handlers` refuse past. */
export const DEFAULT_MAX_IDS_PER_ENTITY = 1000
export const DEFAULT_MAX_BODY_BYTES = 1024 * 1024
/**
 * What a request carries besides its payload: `{"operation":"read","payload":…}`
 * over HTTP, the request frame over RPC. Kept free under `maxBodyBytes`.
 */
const ENVELOPE_BYTES = 512

const encoder = new TextEncoder()
/** The bytes a value takes as JSON, as a request body carries it. */
const jsonBytes = (value: unknown): number => encoder.encode(JSON.stringify(value)).length

/** A stable key for a requirement, so an equal requirement in flight is joined. */
export const requirementKey = (requirement: Requirement): string =>
  stableStringify([
    requirement.entity,
    requirement.id,
    [...requirement.fields].sort(),
    requirement.windows ?? null,
    requirement.relations ?? null,
  ])

/** Whether a requirement pages a relation anywhere in its graph. */
const hasWindows = (requirement: RelationRequirement): boolean =>
  requirement.windows !== undefined || Object.values(requirement.relations ?? {}).some(hasWindows)

interface Limits {
  readonly maxIds: number
  /** The bytes a read's `requests` may take. */
  readonly budget: number
}

const limitsOf = (options: ClientOptions): Limits => ({
  maxIds: Math.max(1, options.maxIdsPerEntity ?? DEFAULT_MAX_IDS_PER_ENTITY),
  budget: (options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES) - ENVELOPE_BYTES,
})

/** A read a batch runs: the keys it settles, and the merged requests it sends, or why it cannot. */
interface PlannedRead {
  readonly keys: ReadonlyArray<string>
  readonly requests: ReadonlyArray<Requirement>
  readonly tooLarge: boolean
}

/**
 * Cuts merged requests into the fewest reads that fit `limits`, in order. A
 * request too large to send alone is a read of its own that is never sent.
 */
const cut = (
  requests: ReadonlyArray<Requirement>,
  limits: Limits,
): ReadonlyArray<{ readonly requests: ReadonlyArray<Requirement>; readonly tooLarge: boolean }> => {
  const pieces: Array<{ requests: Requirement[]; bytes: number; ids: Map<string, number> }> = []
  const tooLarge: Requirement[] = []
  for (const request of requests) {
    // One byte for the comma between two requests.
    const bytes = jsonBytes(request) + 1
    if (bytes > limits.budget) {
      tooLarge.push(request)
      continue
    }
    const last = pieces.at(-1)
    if (
      last !== undefined &&
      last.bytes + bytes <= limits.budget &&
      (last.ids.get(request.entity) ?? 0) < limits.maxIds
    ) {
      last.requests.push(request)
      last.bytes += bytes
      last.ids.set(request.entity, (last.ids.get(request.entity) ?? 0) + 1)
    } else {
      pieces.push({ requests: [request], bytes, ids: new Map([[request.entity, 1]]) })
    }
  }
  return [
    ...pieces.map(piece => ({ requests: piece.requests, tooLarge: false })),
    ...tooLarge.map(request => ({ requests: [request], tooLarge: true })),
  ]
}

/**
 * The reads a batch runs. Requirements that page nothing union into one
 * request per entity and id, cut to `limits`, and every waiter may write its
 * read's whole result, since plain values are the same whoever asked. A
 * requirement that pages a relation reads alone: a page answers exactly one
 * window, and a waiter cannot tell which of two pages for the same entity was
 * its own.
 */
const readsOf = (
  owned: ReadonlyMap<string, Requirement>,
  limits: Limits,
): ReadonlyArray<PlannedRead> => {
  const plain = [...owned].filter(([, requirement]) => !hasWindows(requirement))
  const paged = [...owned].filter(([, requirement]) => hasWindows(requirement))
  const target = (requirement: Requirement) => `${requirement.entity}\u0000${requirement.id}`
  return [
    ...cut(Requirement.merge(plain.map(([, requirement]) => requirement)), limits).map(piece => {
      const targets = new Set(piece.requests.map(target))
      return {
        keys: plain
          .filter(([, requirement]) => targets.has(target(requirement)))
          .map(([key]) => key),
        ...piece,
      }
    }),
    ...paged.flatMap(([key, requirement]) =>
      cut([requirement], limits).map(piece => ({ keys: [key], ...piece })),
    ),
  ]
}

/** How long a call may go unwanted before it is interrupted: a frame. */
const CANCEL_AFTER_MS = 16

interface Call<A, E> {
  readonly keys: ReadonlyArray<string>
  readonly done: Deferred.Deferred<A, E>
  fiber: Fiber.Fiber<unknown, unknown> | undefined
}

/**
 * Calls in flight, each settling a set of keys, and the callers waiting on
 * each key. A caller holds its keys from before it asks until it stops
 * waiting; a call whose every key is held by no one for `CANCEL_AFTER_MS`
 * is interrupted. The wait lets a read entry that restarts and asks again
 * for some of the same keys join the call rather than cancel and resend it:
 * the restart is a few scheduler turns, each of which may be a timer turn.
 */
const inFlight = <A, E>() => {
  const waiting = new Map<string, number>()
  const running = new Map<string, Call<A, E>>()
  const isRunning = (call: Call<A, E>) => call.keys.some(key => running.get(key) === call)
  const cancelIfUnwanted = (call: Call<A, E>) => {
    if (!isRunning(call) || call.keys.some(key => waiting.has(key))) return
    // Gone from the table first, so a later caller starts a call of its own.
    for (const key of call.keys) if (running.get(key) === call) running.delete(key)
    call.fiber?.interruptUnsafe()
  }
  return {
    running,
    hold: (keys: ReadonlyArray<string>) =>
      Effect.sync(() => {
        for (const key of keys) waiting.set(key, (waiting.get(key) ?? 0) + 1)
      }),
    release: (keys: ReadonlyArray<string>) =>
      Effect.sync(() => {
        const calls = new Set<Call<A, E>>()
        for (const key of keys) {
          const count = (waiting.get(key) ?? 1) - 1
          if (count > 0) waiting.set(key, count)
          else waiting.delete(key)
          const call = running.get(key)
          if (call !== undefined) calls.add(call)
        }
        if (calls.size > 0) setTimeout(() => calls.forEach(cancelIfUnwanted), CANCEL_AFTER_MS)
      }),
    /** Runs `effect` detached as the call settling `keys`; a settled call leaves the table. */
    start: (keys: ReadonlyArray<string>, effect: Effect.Effect<A, E>) =>
      Effect.gen(function* () {
        const call: Call<A, E> = { keys, done: yield* Deferred.make<A, E>(), fiber: undefined }
        for (const key of keys) running.set(key, call)
        call.fiber = yield* Effect.forkDetach(
          Effect.onExit(effect, exit =>
            Effect.suspend(() => {
              for (const key of keys) if (running.get(key) === call) running.delete(key)
              return Deferred.done(call.done, exit)
            }),
          ),
        )
        return call.done
      }),
  }
}

/** `request` waited on with `keys` held, so the calls it joins run while it waits. */
const waitHolding = <A, E, E2>(
  calls: ReturnType<typeof inFlight<A, E>>,
  keys: ReadonlyArray<string>,
  request: Effect.Effect<ReadonlyArray<Deferred.Deferred<A, E>>, E2>,
): Effect.Effect<ReadonlyArray<A>, E | E2> =>
  Effect.acquireUseRelease(
    calls.hold(keys),
    () =>
      Effect.flatMap(request, deferreds =>
        Effect.forEach(new Set(deferreds), Deferred.await, { concurrency: 'unbounded' }),
      ),
    () => calls.release(keys),
  )

class QueryRead extends Request.Class<
  { readonly key: string; readonly request: QueryRequestValue },
  Deferred.Deferred<QueryResultValue, QueryError>
> {}

/**
 * Wraps a raw query so that an identical query in flight (same query, input,
 * and window) is joined rather than run again; distinct queries run
 * concurrently. A page answers exactly one window, so nothing is batched. A
 * query nobody waits on any more is interrupted.
 */
export const coalesceQueries = (
  query: QueryRun,
  options: ClientOptions = {},
): Effect.Effect<QueryRun> =>
  Effect.gen(function* () {
    const calls = inFlight<QueryResultValue, QueryError>()
    const budget = limitsOf(options).budget
    const runAll = (entries: ReadonlyArray<Request.Entry<QueryRead>>) =>
      Effect.gen(function* () {
        const done = new Map<string, Deferred.Deferred<QueryResultValue, QueryError>>()
        for (const entry of entries) {
          const { key, request } = entry.request
          if (done.has(key)) continue
          const joined = calls.running.get(key)?.done
          done.set(
            key,
            joined ??
              (yield* calls.start(
                [key],
                jsonBytes(request) > budget
                  ? Effect.fail(new RemoteQueryError({ message: tooLargeMessage(options) }))
                  : query(request),
              )),
          )
        }
        for (const entry of entries) yield* Request.succeed(entry, done.get(entry.request.key)!)
      })
    let resolver = RequestResolver.make<QueryRead>(runAll)
    if (options.window !== undefined) {
      resolver = RequestResolver.setDelay(resolver, Duration.fromInputUnsafe(options.window))
    }
    return request => {
      const key = stableStringify([
        request.query,
        request.input,
        request.window,
        request.select ?? null,
      ])
      return Effect.map(
        waitHolding(
          calls,
          [key],
          Effect.map(Effect.request(new QueryRead({ key, request }), resolver), done => [done]),
        ),
        ([result]) => result!,
      )
    }
  })

/** Why a request was not sent: larger than the server takes. */
const tooLargeMessage = (options: ClientOptions): string =>
  `The request is larger than the server takes (${options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES} bytes)`

class ReadRequirement extends Request.Class<
  { readonly key: string; readonly requirement: Requirement },
  Deferred.Deferred<BatchResult, ReadError>
> {}

/**
 * Wraps a raw batch read so that requirements are batched, cut to the
 * server's limits, and deduplicated. Every waiter receives the whole result
 * of each read it waited on; `Remote.writeRead` is idempotent, so writing it
 * more than once is harmless. A read nobody waits on any more is interrupted.
 */
export const coalesceReads = (
  read: BatchRead,
  options: ClientOptions = {},
): Effect.Effect<BatchRead> =>
  Effect.gen(function* () {
    const calls = inFlight<BatchResult, ReadError>()
    const limits = limitsOf(options)

    const runAll = (entries: ReadonlyArray<Request.Entry<ReadRequirement>>) =>
      Effect.gen(function* () {
        // Per requirement key: the call that settles it. One already in
        // flight from an earlier batch is joined; the rest are read here.
        const done = new Map<string, Deferred.Deferred<BatchResult, ReadError>>()
        const owned = new Map<string, Requirement>()
        for (const entry of entries) {
          const key = entry.request.key
          const joined = calls.running.get(key)?.done
          if (joined !== undefined) done.set(key, joined)
          else owned.set(key, entry.request.requirement)
        }
        for (const planned of readsOf(owned, limits)) {
          const settled = yield* calls.start(
            planned.keys,
            planned.tooLarge
              ? Effect.fail(new RemoteReadError({ message: tooLargeMessage(options) }))
              : read({ version: REMOTE_PROTOCOL_VERSION, requests: planned.requests }),
          )
          for (const key of planned.keys) done.set(key, settled)
        }
        for (const entry of entries) yield* Request.succeed(entry, done.get(entry.request.key)!)
      })

    let resolver = RequestResolver.make<ReadRequirement>(runAll)
    if (options.window !== undefined) {
      resolver = RequestResolver.setDelay(resolver, Duration.fromInputUnsafe(options.window))
    }

    return batch => {
      if (batch.requests.length === 0) return Effect.succeed({ entities: [], settled: [] })
      const requirements = batch.requests.map(requirement => ({
        key: requirementKey(requirement),
        requirement,
      }))
      return waitHolding(
        calls,
        requirements.map(({ key }) => key),
        Effect.forEach(
          requirements,
          ({ key, requirement }) =>
            Effect.request(new ReadRequirement({ key, requirement }), resolver),
          { concurrency: 'unbounded' },
        ),
      ).pipe(
        Effect.map(results => ({
          entities: results.flatMap(result => result.entities),
          settled: results.flatMap(result => result.settled),
        })),
      )
    }
  })

/**
 * Wraps a `RemoteClient` layer in what `ClientOptions` asks: reads and
 * queries coalesced, cut to the server's limits and cancelled when nobody
 * waits on them, every call held to its deadline, and a mutation larger than
 * the server takes refused without being sent.
 */
export const coalescedLayer = <E, R>(
  layer: Layer.Layer<RemoteClient, E, R>,
  options: ClientOptions = {},
): Layer.Layer<RemoteClient, E, R> =>
  Layer.effect(
    RemoteClient,
    Effect.gen(function* () {
      const client = yield* RemoteClient
      const read = yield* coalesceReads(client.read, options)
      const query = yield* coalesceQueries(client.query, options)
      const { budget } = limitsOf(options)
      return {
        ...client,
        read: batch => withDeadline(read(batch), options.timeout),
        query: request => withDeadline(query(request), options.timeout),
        mutate: request =>
          jsonBytes(request) > budget
            ? // Refused rather than unreachable: sending it again is refused again.
              Effect.fail(new RemoteMutationError({ message: tooLargeMessage(options) }))
            : withDeadline(client.mutate(request), options.timeout),
      }
    }),
  ).pipe(Layer.provide(layer))
