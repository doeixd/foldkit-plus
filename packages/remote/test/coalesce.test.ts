import { Deferred, Effect, Exit, Fiber, Layer, Schema, Stream } from 'effect'
import { TestClock } from 'effect/testing'
import { describe, expect, it } from 'vitest'
import {
  REMOTE_PROTOCOL_VERSION,
  Remote,
  RemoteClient,
  RemoteQueryError,
  RemoteReadError,
  coalesceQueries,
  coalesceReads,
  requirementKey,
  type BatchRead,
  type QueryRun,
} from '../src/index.js'
import { withCallTimeout, withDeadline } from '../src/deadline.js'

type Batch = Parameters<BatchRead>[0]

const answer = (batch: Batch) => ({
  entities: batch.requests.map(request => ({
    entity: request.entity,
    id: request.id,
    values: Object.fromEntries(request.fields.map(field => [field, `${field}:${request.id}`])),
  })),
  settled: [],
})

/** A raw read that records every batch and can be held open per call. */
const recording = (options: { readonly hold?: boolean; readonly fail?: boolean } = {}) => {
  const batches: Batch[] = []
  const gates: Array<Deferred.Deferred<void>> = []
  const read: BatchRead = batch =>
    Effect.gen(function* () {
      batches.push(batch)
      if (options.hold === true) {
        const gate = yield* Deferred.make<void>()
        gates.push(gate)
        yield* Deferred.await(gate)
      }
      if (options.fail === true) return yield* new RemoteReadError({ message: 'boom' })
      return answer(batch)
    })
  return { batches, gates, read }
}

/** Yields until `done` holds: a forked call starts after some scheduler turns, not a fixed count. */
const until = (done: () => boolean) =>
  Effect.gen(function* () {
    for (let turn = 0; turn < 100 && !done(); turn++) yield* Effect.yieldNow
    expect(done()).toBe(true)
  })

const req = (id: string, fields: string[]) => ({ entity: 'User', id, fields })
const batch = (...requests: Array<ReturnType<typeof req>>): Batch => ({
  version: REMOTE_PROTOCOL_VERSION,
  requests,
})

describe('coalesceReads', () => {
  it('runs concurrent identical reads once and fans the result out', async () => {
    const raw = recording()
    const results = await Effect.runPromise(
      Effect.gen(function* () {
        const read = yield* coalesceReads(raw.read)
        return yield* Effect.all(
          [read(batch(req('u1', ['name']))), read(batch(req('u1', ['name'])))],
          { concurrency: 'unbounded' },
        )
      }),
    )
    expect(raw.batches).toHaveLength(1)
    expect(results[0]).toEqual(results[1])
    expect(results[0].entities).toEqual([{ entity: 'User', id: 'u1', values: { name: 'name:u1' } }])
  })

  it('unions overlapping fields and batches different ids into one read', async () => {
    const raw = recording()
    await Effect.runPromise(
      Effect.gen(function* () {
        const read = yield* coalesceReads(raw.read)
        yield* Effect.all(
          [
            read(batch(req('u1', ['name']))),
            read(batch(req('u1', ['email']))),
            read(batch(req('u2', ['name']))),
          ],
          { concurrency: 'unbounded' },
        )
      }),
    )
    expect(raw.batches).toHaveLength(1)
    expect(raw.batches[0]!.requests).toEqual([req('u1', ['name', 'email']), req('u2', ['name'])])
  })

  it('each waiter sees the whole batch, so it can write every entity it needs', async () => {
    const raw = recording()
    const results = await Effect.runPromise(
      Effect.gen(function* () {
        const read = yield* coalesceReads(raw.read)
        return yield* Effect.all(
          [read(batch(req('u1', ['name']))), read(batch(req('u2', ['name'])))],
          { concurrency: 'unbounded' },
        )
      }),
    )
    expect(results[0].entities.map(entity => entity.id)).toEqual(['u1', 'u2'])
  })

  it('joins a requirement already in flight instead of reading it again', async () => {
    const raw = recording({ hold: true })
    const [first, second] = await Effect.runPromise(
      Effect.gen(function* () {
        const read = yield* coalesceReads(raw.read)
        const first = yield* Effect.forkChild(read(batch(req('u1', ['name']))))
        yield* until(() => raw.gates.length === 1)
        const second = yield* Effect.forkChild(read(batch(req('u1', ['name']))))
        for (let turn = 0; turn < 20; turn++) yield* Effect.yieldNow
        yield* Deferred.succeed(raw.gates[0]!, undefined)
        return [yield* Fiber.join(first), yield* Fiber.join(second)]
      }),
    )
    expect(raw.batches).toHaveLength(1)
    expect(first).toEqual(second)
  })

  it('a later batch reads only what is not in flight', async () => {
    const raw = recording({ hold: true })
    await Effect.runPromise(
      Effect.gen(function* () {
        const read = yield* coalesceReads(raw.read)
        const first = yield* Effect.forkChild(read(batch(req('u1', ['name']))))
        yield* until(() => raw.gates.length === 1)
        const second = yield* Effect.forkChild(
          read(batch(req('u1', ['name']), req('u2', ['name']))),
        )
        yield* until(() => raw.gates.length === 2)
        expect(raw.batches[1]!.requests).toEqual([req('u2', ['name'])])
        for (const gate of raw.gates) yield* Deferred.succeed(gate, undefined)
        yield* Fiber.join(first)
        const joined = yield* Fiber.join(second)
        expect(joined.entities.map(entity => entity.id).sort()).toEqual(['u1', 'u2'])
      }),
    )
  })

  it('a failed read fails every waiter and releases the requirement', async () => {
    const raw = recording({ fail: true })
    const outcome = await Effect.runPromise(
      Effect.gen(function* () {
        const read = yield* coalesceReads(raw.read)
        const failures = yield* Effect.all(
          [
            Effect.result(read(batch(req('u1', ['name'])))),
            Effect.result(read(batch(req('u1', ['name'])))),
          ],
          { concurrency: 'unbounded' },
        )
        const again = yield* Effect.result(read(batch(req('u1', ['name']))))
        return { failures, again }
      }),
    )
    expect(outcome.failures.map(result => result._tag)).toEqual(['Failure', 'Failure'])
    expect(outcome.again._tag).toBe('Failure')
    expect(raw.batches).toHaveLength(2)
  })

  it('interrupting the only waiter keeps the batch running for a later joiner', async () => {
    const raw = recording({ hold: true })
    await Effect.runPromise(
      Effect.gen(function* () {
        const read = yield* coalesceReads(raw.read)
        const fiber = yield* Effect.forkChild(read(batch(req('u1', ['name']))))
        yield* until(() => raw.gates.length === 1)
        yield* Fiber.interrupt(fiber)
        // Asked again before a timer turn: a read entry restarting on new requirements.
        const later = yield* Effect.forkChild(read(batch(req('u1', ['name']))))
        yield* Effect.sleep('20 millis')
        expect(raw.batches).toHaveLength(1)
        yield* Deferred.succeed(raw.gates[0]!, undefined)
        const exit = yield* Fiber.await(later)
        expect(Exit.isSuccess(exit)).toBe(true)
      }),
    )
  })

  it('an empty batch never touches the transport', async () => {
    const raw = recording()
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const read = yield* coalesceReads(raw.read)
        return yield* read(batch())
      }),
    )
    expect(result).toEqual({ settled: [], entities: [] })
    expect(raw.batches).toHaveLength(0)
  })

  it('a window collects requirements issued apart in time', async () => {
    const raw = recording()
    await Effect.runPromise(
      Effect.gen(function* () {
        const read = yield* coalesceReads(raw.read, { window: '50 millis' })
        const first = yield* Effect.forkChild(read(batch(req('u1', ['name']))))
        yield* TestClock.adjust('10 millis')
        const second = yield* Effect.forkChild(read(batch(req('u2', ['name']))))
        yield* TestClock.adjust('100 millis')
        yield* Fiber.join(first)
        yield* Fiber.join(second)
      }).pipe(Effect.provide(TestClock.layer())),
    )
    expect(raw.batches).toHaveLength(1)
    expect(raw.batches[0]!.requests.map(request => request.id)).toEqual(['u1', 'u2'])
  })

  it('keys a requirement by its content, not its field order', () => {
    expect(requirementKey(req('u1', ['a', 'b']))).toBe(requirementKey(req('u1', ['b', 'a'])))
    expect(requirementKey(req('u1', ['a']))).not.toBe(requirementKey(req('u2', ['a'])))
    expect(
      requirementKey({ ...req('u1', ['a']), relations: { a: { entity: 'B', fields: ['x'] } } }),
    ).not.toBe(requirementKey(req('u1', ['a'])))
  })
})

type QueryRequest = Parameters<QueryRun>[0]

/** A raw query that records every request and can be held open per call. */
const recordingQuery = (options: { readonly hold?: boolean; readonly fail?: boolean } = {}) => {
  const requests: QueryRequest[] = []
  const gates: Array<Deferred.Deferred<void>> = []
  const query: QueryRun = request =>
    Effect.gen(function* () {
      requests.push(request)
      if (options.hold === true) {
        const gate = yield* Deferred.make<void>()
        gates.push(gate)
        yield* Deferred.await(gate)
      }
      if (options.fail === true) return yield* new RemoteQueryError({ message: 'boom' })
      return {
        edges: [
          { entity: 'User', id: String(request.input), key: `User:${String(request.input)}` },
        ],
        start: { _tag: 'Terminal' as const },
        end: { _tag: 'Terminal' as const },
      }
    })
  return { requests, gates, query }
}

const q = (input: unknown, window: QueryRequest['window'] = { first: 10 }): QueryRequest => ({
  query: 'Users',
  input,
  window,
})

describe('coalesceQueries', () => {
  it('runs concurrent identical queries once and fans the result out', async () => {
    const raw = recordingQuery()
    const results = await Effect.runPromise(
      Effect.gen(function* () {
        const query = yield* coalesceQueries(raw.query)
        return yield* Effect.all([query(q('u1')), query(q('u1'))], { concurrency: 'unbounded' })
      }),
    )
    expect(raw.requests).toHaveLength(1)
    expect(results[0]).toEqual(results[1])
    expect(results[0]!.edges.map(edge => edge.key)).toEqual(['User:u1'])
  })

  it('a different input or window is another query, run concurrently', async () => {
    const raw = recordingQuery({ hold: true })
    const results = await Effect.runPromise(
      Effect.gen(function* () {
        const query = yield* coalesceQueries(raw.query)
        const fiber = yield* Effect.forkChild(
          Effect.all([query(q('u1')), query(q('u2')), query(q('u1', { first: 20 }))], {
            concurrency: 'unbounded',
          }),
        )
        yield* until(() => raw.gates.length === 3)
        // All three are in flight before any answers.
        expect(raw.requests.map(request => [request.input, request.window.first])).toEqual([
          ['u1', 10],
          ['u2', 10],
          ['u1', 20],
        ])
        for (const gate of raw.gates) yield* Deferred.succeed(gate, undefined)
        return yield* Fiber.join(fiber)
      }),
    )
    expect(results.map(result => result.edges[0]!.id)).toEqual(['u1', 'u2', 'u1'])
  })

  it('an identical query issued after the first completed runs again: nothing is cached', async () => {
    const raw = recordingQuery()
    await Effect.runPromise(
      Effect.gen(function* () {
        const query = yield* coalesceQueries(raw.query)
        yield* query(q('u1'))
        yield* query(q('u1'))
      }),
    )
    expect(raw.requests).toHaveLength(2)
  })

  it('a failed query fails every waiter', async () => {
    const raw = recordingQuery({ fail: true })
    const exit = await Effect.runPromiseExit(
      Effect.gen(function* () {
        const query = yield* coalesceQueries(raw.query)
        return yield* Effect.all([query(q('u1')), query(q('u1'))], { concurrency: 'unbounded' })
      }),
    )
    expect(Exit.isFailure(exit)).toBe(true)
    expect(raw.requests).toHaveLength(1)
  })

  it('keys a query by its content, not its input’s key order', async () => {
    const raw = recordingQuery()
    await Effect.runPromise(
      Effect.gen(function* () {
        const query = yield* coalesceQueries(raw.query)
        yield* Effect.all(
          [query(q({ a: 1, b: 2 })), query(q({ b: 2, a: 1 })), query(q({ a: 1, b: 3 }))],
          { concurrency: 'unbounded' },
        )
      }),
    )
    expect(raw.requests).toHaveLength(2)
  })
})

describe('Remote.coalesced and Remote.clientLayer', () => {
  it('wraps a hand-written client so its reads coalesce', async () => {
    const raw = recording()
    const Raw = Layer.succeed(RemoteClient, {
      read: raw.read,
      query: () => Effect.die('unused'),
      mutate: () => Effect.die('unused'),
      live: () => Stream.empty,
    })
    await Effect.runPromise(
      Effect.gen(function* () {
        const client = yield* RemoteClient
        yield* Effect.all(
          [client.read(batch(req('u1', ['name']))), client.read(batch(req('u1', ['name'])))],
          { concurrency: 'unbounded' },
        )
      }).pipe(Effect.provide(Remote.coalesced(Raw))),
    )
    expect(raw.batches).toHaveLength(1)
  })

  it('clientLayer coalesces the RPC client’s reads and queries', async () => {
    const raw = recording()
    const rawQuery = recordingQuery()
    const rpc = {
      FoldkitRemoteRead: raw.read,
      FoldkitRemoteQuery: rawQuery.query,
      FoldkitRemoteMutate: () => Effect.die('unused'),
      FoldkitRemoteLive: () => Stream.empty,
    }
    await Effect.runPromise(
      Effect.gen(function* () {
        const client = yield* RemoteClient
        yield* Effect.all(
          [
            client.read(batch(req('u1', ['name']))),
            client.read(batch(req('u2', ['name']))),
            client.query(q('u1')),
            client.query(q('u1')),
          ],
          { concurrency: 'unbounded' },
        )
      }).pipe(Effect.provide(Remote.clientLayer(rpc))),
    )
    expect(raw.batches).toHaveLength(1)
    expect(rawQuery.requests).toHaveLength(1)
    expect(Schema.is(Schema.Number)(raw.batches[0]!.version)).toBe(true)
  })
})

/** A raw read held open until interrupted, recording what it was asked and what was interrupted. */
const abandoned = () => {
  const asked: Batch[] = []
  const interrupted: Batch[] = []
  const read: BatchRead = batch =>
    Effect.sync(() => asked.push(batch)).pipe(
      Effect.andThen(Effect.never),
      Effect.onInterrupt(() => Effect.sync(() => interrupted.push(batch))),
    )
  return { asked, interrupted, read }
}

describe('a call nobody waits on is interrupted (#355)', () => {
  it('interrupts a read whose every waiter left, after a frame', async () => {
    const raw = abandoned()
    await Effect.runPromise(
      Effect.gen(function* () {
        const read = yield* coalesceReads(raw.read)
        const fiber = yield* Effect.forkChild(read(batch(req('u1', ['name']), req('u2', ['name']))))
        yield* until(() => raw.asked.length === 1)
        yield* Fiber.interrupt(fiber)
        yield* Effect.sleep('40 millis')
        expect(raw.interrupted).toEqual(raw.asked)
        // Gone from the in-flight table: the next caller reads again rather than joining it.
        yield* Effect.forkChild(read(batch(req('u1', ['name']))))
        yield* until(() => raw.asked.length === 2)
      }),
    )
  })

  it('keeps a read while any of its keys has a waiter, and that waiter gets the whole answer', async () => {
    const raw = recording({ hold: true })
    await Effect.runPromise(
      Effect.gen(function* () {
        const read = yield* coalesceReads(raw.read)
        const wide = yield* Effect.forkChild(read(batch(req('u1', ['name']), req('u2', ['name']))))
        yield* until(() => raw.gates.length === 1)
        const narrow = yield* Effect.forkChild(read(batch(req('u2', ['name']))))
        yield* Fiber.interrupt(wide)
        yield* Effect.sleep('40 millis')
        yield* Deferred.succeed(raw.gates[0]!, undefined)
        const answer = yield* Fiber.join(narrow)
        expect(answer.entities.map(entity => entity.id)).toEqual(['u1', 'u2'])
        expect(raw.batches).toHaveLength(1)
      }),
    )
  })

  it('interrupts a query whose every waiter left', async () => {
    const interrupted: unknown[] = []
    const run: QueryRun = request =>
      Effect.never.pipe(
        Effect.onInterrupt(() => Effect.sync(() => interrupted.push(request.input))),
      )
    await Effect.runPromise(
      Effect.gen(function* () {
        const query = yield* coalesceQueries(run)
        const fiber = yield* Effect.forkChild(query(q('u1')))
        yield* Effect.sleep('5 millis')
        yield* Fiber.interrupt(fiber)
        yield* Effect.sleep('40 millis')
        expect(interrupted).toEqual(['u1'])
      }),
    )
  })
})

describe('a batch is cut to the limits the client knows (#354, #359)', () => {
  const ids = (count: number) =>
    Array.from({ length: count }, (_, index) => req(`u${index}`, ['name']))

  it('cuts a batch naming more ids of one Entity than maxIdsPerEntity, and answers every one', async () => {
    const raw = recording()
    const answer = await Effect.runPromise(
      Effect.gen(function* () {
        const read = yield* coalesceReads(raw.read, { maxIdsPerEntity: 2 })
        return yield* read(batch(...ids(5)))
      }),
    )
    expect(raw.batches.map(each => each.requests.length)).toEqual([2, 2, 1])
    expect(answer.entities.map(entity => entity.id).sort()).toEqual(['u0', 'u1', 'u2', 'u3', 'u4'])
  })

  it('cuts by bytes so each request fits maxBodyBytes', async () => {
    const raw = recording()
    const maxBodyBytes = 512 + 200
    await Effect.runPromise(
      Effect.gen(function* () {
        const read = yield* coalesceReads(raw.read, { maxBodyBytes })
        return yield* read(batch(...ids(20)))
      }),
    )
    expect(raw.batches.length).toBeGreaterThan(1)
    for (const sent of raw.batches) {
      expect(JSON.stringify({ operation: 'read', payload: sent }).length).toBeLessThanOrEqual(
        maxBodyBytes,
      )
    }
    expect(raw.batches.flatMap(each => each.requests)).toHaveLength(20)
  })

  it('fails a requirement too large to send alone without sending it, and reads the rest', async () => {
    const raw = recording()
    const outcome = await Effect.runPromise(
      Effect.gen(function* () {
        const read = yield* coalesceReads(raw.read, { maxBodyBytes: 512 + 100 })
        return yield* Effect.all(
          [
            Effect.flip(read(batch(req('u2', ['x'.repeat(200)])))),
            read(batch(req('u1', ['name']))),
          ],
          { concurrency: 'unbounded' },
        )
      }),
    )
    expect(outcome[0].message).toContain('larger than the server takes')
    expect(raw.batches.flatMap(each => each.requests.map(request => request.id))).toEqual(['u1'])
  })

  it('refuses a query or a mutation larger than maxBodyBytes as refused, not unreachable', async () => {
    const sent: string[] = []
    const Raw = Layer.succeed(RemoteClient, {
      read: () => Effect.die('unused'),
      query: () => Effect.sync(() => void sent.push('query')).pipe(Effect.andThen(Effect.never)),
      mutate: () => Effect.sync(() => void sent.push('mutate')).pipe(Effect.andThen(Effect.never)),
      live: () => Stream.empty,
    })
    const errors = await Effect.runPromise(
      Effect.gen(function* () {
        const client = yield* RemoteClient
        const big = 'x'.repeat(300)
        return yield* Effect.all([
          Effect.flip(client.query(q(big))),
          Effect.flip(client.mutate({ requestId: 'r1', mutation: 'M', input: { big } })),
        ])
      }).pipe(Effect.provide(Remote.coalesced(Raw, { maxBodyBytes: 512 + 100 }))),
    )
    expect(errors.map(error => error._tag)).toEqual(['RemoteQueryError', 'RemoteMutationError'])
    expect(sent).toEqual([])
  })
})

describe('a deadline per client and per call (#353)', () => {
  const never = Layer.succeed(RemoteClient, {
    read: () => Effect.never,
    query: () => Effect.never,
    mutate: () => Effect.never,
    live: () => Stream.empty,
  })

  it('fails a read, a query and a mutation that outlive the client’s timeout, each its own way', async () => {
    const errors = await Effect.runPromise(
      Effect.gen(function* () {
        const client = yield* RemoteClient
        const fiber = yield* Effect.forkChild(
          Effect.all(
            [
              Effect.flip(client.read(batch(req('u1', ['name'])))),
              Effect.flip(client.query(q('u1'))),
              Effect.flip(client.mutate({ requestId: 'r1', mutation: 'M', input: {} })),
            ],
            { concurrency: 'unbounded' },
          ),
        )
        yield* Effect.yieldNow
        yield* TestClock.adjust('19 seconds')
        expect(fiber.pollUnsafe()).toBeUndefined()
        yield* TestClock.adjust('1 second')
        return yield* Fiber.join(fiber)
      }).pipe(
        Effect.provide(Remote.coalesced(never, { timeout: '20 seconds' })),
        Effect.provide(TestClock.layer()),
      ),
    )
    expect(errors.map(error => [error._tag, error.message])).toEqual([
      ['Unreachable', 'No answer within 20s'],
      ['Unreachable', 'No answer within 20s'],
      ['Unreachable', 'No answer within 20s'],
    ])
  })

  it('a caller’s own deadline wins over the client’s', async () => {
    const error = await Effect.runPromise(
      Effect.gen(function* () {
        const client = yield* RemoteClient
        const fiber = yield* Effect.forkChild(
          Effect.flip(withCallTimeout(client.read(batch(req('u1', ['name']))), '1 second')),
        )
        yield* Effect.yieldNow
        yield* TestClock.adjust('1 second')
        return yield* Fiber.join(fiber)
      }).pipe(
        Effect.provide(Remote.coalesced(never, { timeout: '20 seconds' })),
        Effect.provide(TestClock.layer()),
      ),
    )
    expect(error.message).toBe('No answer within 1s')
  })

  it('a caller that gives up does not fail another waiting on the same read', async () => {
    const raw = recording({ hold: true })
    await Effect.runPromise(
      Effect.gen(function* () {
        const read = yield* coalesceReads(raw.read)
        const patient = yield* Effect.forkChild(read(batch(req('u1', ['name']))))
        const hasty = yield* Effect.forkChild(
          withDeadline(read(batch(req('u1', ['name']))), '1 second'),
        )
        yield* until(() => raw.gates.length === 1)
        yield* TestClock.adjust('1 second')
        expect(Exit.isFailure(yield* Fiber.await(hasty))).toBe(true)
        yield* Deferred.succeed(raw.gates[0]!, undefined)
        expect(Exit.isSuccess(yield* Fiber.await(patient))).toBe(true)
      }).pipe(Effect.provide(TestClock.layer())),
    )
  })
})
