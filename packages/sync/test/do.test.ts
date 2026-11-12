// @vitest-environment node
/**
 * `defineDocumentHost`: one Durable Object serving a document's Sync
 * exchange. Non-upgrades are 404s that open nothing, each upgrade resolves
 * its own principal and shares the one journal, and commits reach every
 * open socket as notices.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ActorId, Cursor, DocumentId as JournalDocumentId, Journal, OpId } from 'foldkit-durable'
import { Context, Effect, Layer, Option, Result, Schema, Scope, type Duration } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import type * as Update from 'foldkit/update'
import { MessageSet, Projection, Surface } from 'foldkit-surface'
import { RemoteUnauthenticated } from 'foldkit-remote'
import type { Diagnostic } from 'foldkit-surface'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Sync, documentId, replicaId, type Operation } from '../src/index.js'
import { defineDocumentHost, type AcceptingWebSocket } from '../src/do.js'
import { documentHost, reaction } from '../src/journal.js'
import { memoryStorage } from './memoryStorage.js'
import { workerSocket } from '../src/transport.js'
import { Message, Todos, closeScopes, openJournal, openScope, pendingOf } from './fixtures/todos.js'
import { FakeWebSocket } from './sockets.js'

afterEach(() => {
  closeScopes()
  vi.unstubAllGlobals()
})

/**
 * Undici's `Response` refuses status 101, which is the whole upgrade answer
 * in a worker. The shim carries what the host sets — status, JSON body, and
 * the socket — so the fake tests can drive upgrades; the miniflare test
 * proves the real `Response` accepts them.
 */
class FakeResponse {
  readonly status: number
  readonly client: unknown
  private readonly jsonBody: unknown

  constructor(body: unknown, init: { status: number; webSocket?: unknown }) {
    this.status = init.status
    this.client = init.webSocket
    this.jsonBody = typeof body === 'string' ? JSON.parse(body) : body
  }

  async json(): Promise<unknown> {
    return this.jsonBody
  }

  static json(body: unknown, init?: { status?: number }): FakeResponse {
    return new FakeResponse(JSON.stringify(body), { status: init?.status ?? 200 })
  }
}

beforeEach(() => {
  vi.stubGlobal('Response', FakeResponse)
})

class FakeBase {
  constructor(
    readonly ctx: unknown,
    readonly env: unknown,
  ) {}
}

type TestJournal = Awaited<ReturnType<typeof openJournal>>

const host = (
  options: {
    readonly admit?: (principal: string, operation: Operation) => boolean
    readonly opens?: (principal: string) => Effect.Effect<boolean>
    readonly resolvePrincipal?: (request: Request) => Effect.Effect<string, RemoteUnauthenticated>
    readonly openJournal?: () => Promise<TestJournal>
    readonly settle?: (env: unknown, journal: unknown) => Effect.Effect<void, unknown>
    readonly revalidate?: {
      readonly every: Duration.Input
      readonly key?: (principal: string) => unknown
    }
    /** Sockets that close as a worker's do: see `FakeWebSocket.linked`. */
    readonly lingering?: boolean
  } = {},
) => {
  const pairs: Array<readonly [FakeWebSocket, FakeWebSocket]> = []
  let opens = 0
  const Host = defineDocumentHost(FakeBase, {
    sync: Todos,
    openJournal: async () => {
      opens += 1
      return options.openJournal === undefined ? openJournal() : options.openJournal()
    },
    resolvePrincipal:
      options.resolvePrincipal ??
      (request => Effect.succeed(request.headers.get('x-actor') ?? 'anon')),
    admit: options.admit,
    opens: options.opens,
    settle: options.settle,
    revalidate: options.revalidate,
    pair: () => {
      const pair = FakeWebSocket.linked({ lingering: options.lingering ?? false })
      pairs.push(pair)
      return pair as unknown as readonly [WebSocket, AcceptingWebSocket]
    },
  })
  return { Host, pairs, opens: () => opens }
}

const upgrade = async (
  fetch: (request: Request) => Promise<Response>,
  pairs: Array<readonly [FakeWebSocket, FakeWebSocket]>,
  actor: string,
): Promise<{ response: Response; client: FakeWebSocket }> => {
  const before = pairs.length
  const response = await fetch(
    new Request('http://host/sync', { headers: { Upgrade: 'websocket', 'x-actor': actor } }),
  )
  expect(response.status).toBe(101)
  const pair = pairs[before]!
  expect(pair[1].accepts).toBe(1)
  return { response, client: pair[0] }
}

const roundTrip = (
  client: FakeWebSocket,
  frame: {
    readonly id: string
    readonly cursor: number
    readonly pending: ReadonlyArray<Operation>
  },
): Promise<{ result?: unknown; error?: string }> =>
  new Promise(resolve => {
    const listener = (event: { data?: unknown }): void => {
      if (typeof event.data !== 'string') return
      const parsed = JSON.parse(event.data) as { id?: unknown; result?: unknown; error?: string }
      if (parsed.id !== frame.id) return
      client.removeEventListener('message', listener)
      resolve(parsed)
    }
    client.addEventListener('message', listener)
    client.send(JSON.stringify(frame))
  })

interface ExchangeResult {
  readonly operations: ReadonlyArray<unknown>
  readonly rejected: ReadonlyArray<string>
  readonly reasons: ReadonlyArray<{ readonly reason: string }>
  readonly acknowledged: ReadonlyArray<string>
  readonly epoch: string
}

const resultOf = (reply: { result?: unknown; error?: string }): ExchangeResult => {
  expect(reply.error).toBeUndefined()
  return reply.result as ExchangeResult
}

describe('defineDocumentHost', () => {
  it('answers a non-upgrade with a 404 without opening the journal', async () => {
    const { Host, opens } = host()
    const served = new Host({}, undefined)
    const response = await served.fetch(new Request('http://host/sync'))
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'not found' })
    expect(opens()).toBe(0)
  })

  it('answers a runtime with no WebSocketPair with a 500, resolving no one', async () => {
    let resolved = 0
    const Host = defineDocumentHost(FakeBase, {
      sync: Todos,
      openJournal: async () => openJournal(),
      resolvePrincipal: () => {
        resolved += 1
        return Effect.succeed('ada')
      },
    })
    const served = new Host({}, undefined)
    const response = await served.fetch(
      new Request('http://host/sync', { headers: { Upgrade: 'websocket' } }),
    )
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'Internal error' })
    expect(resolved).toBe(0)
  })

  it('exchanges against one journal shared by every socket', async () => {
    const { Host, pairs, opens } = host()
    const served = new Host({}, undefined)
    const first = await upgrade(served.fetch.bind(served), pairs, 'ada')
    const pending = await pendingOf('a', ['Milk'])
    const sent = resultOf(await roundTrip(first.client, { id: '1', cursor: 0, pending }))
    expect(sent.acknowledged).toHaveLength(1)
    expect(sent.rejected).toEqual([])
    expect(sent.operations).toHaveLength(1)
    expect(typeof sent.epoch).toBe('string')
    const second = await upgrade(served.fetch.bind(served), pairs, 'grace')
    const caughtUp = resultOf(await roundTrip(second.client, { id: '1', cursor: 0, pending: [] }))
    expect(caughtUp.operations).toHaveLength(1)
    expect(opens()).toBe(1)
  })

  it('refuses what the connection may not change, by id', async () => {
    const { Host, pairs } = host({ admit: () => false })
    const served = new Host({}, undefined)
    const { client } = await upgrade(served.fetch.bind(served), pairs, 'ada')
    const pending = await pendingOf('a', ['Milk'])
    const refused = resultOf(await roundTrip(client, { id: '1', cursor: 0, pending }))
    expect(refused.acknowledged).toEqual([])
    expect(refused.rejected).toEqual([pending[0]!.opId])
    expect(refused.reasons).toEqual([
      { opId: pending[0]!.opId, reason: 'This connection may not make changes' },
    ])
  })

  it('refuses a principal who may not open the document every exchange, and lets another', async () => {
    const { Host, pairs } = host({ opens: principal => Effect.succeed(principal !== 'visitor') })
    const served = new Host({}, undefined)
    const { client } = await upgrade(served.fetch.bind(served), pairs, 'visitor')
    const reply = await roundTrip(client, { id: '1', cursor: 0, pending: [] })
    expect(reply.error).toBe('This connection may not open the document')
    const { client: ada } = await upgrade(served.fetch.bind(served), pairs, 'ada')
    expect(resultOf(await roundTrip(ada, { id: '1', cursor: 0, pending: [] })).rejected).toEqual([])
  })

  it('answers the journal principal: a refusal it reports, by id', async () => {
    const refusing = async (): Promise<TestJournal> => {
      const scope = openScope()
      return Effect.runSync(
        Journal.make<Operation, typeof Todos extends Sync<Message, infer S> ? S : never, string>({
          ...Todos.journalContract(),
          file: ':memory:',
          opId: operation => OpId.make(operation.opId),
          actorId: principal => ActorId.make(principal),
          authorize: () => false,
        }).pipe(Effect.provideService(Scope.Scope, scope)),
      )
    }
    const { Host, pairs } = host({ openJournal: refusing })
    const served = new Host({}, undefined)
    const { client } = await upgrade(served.fetch.bind(served), pairs, 'ada')
    const pending = await pendingOf('a', ['Milk'])
    const refused = resultOf(await roundTrip(client, { id: '1', cursor: 0, pending }))
    expect(refused.rejected).toEqual([pending[0]!.opId])
    expect(refused.reasons).toEqual([{ opId: pending[0]!.opId, reason: 'Refused by the server' }])
  })

  it.each([
    [
      'a refused principal with a 401 carrying its message',
      Effect.fail(new RemoteUnauthenticated({ message: 'bad token', reason: 'bad token' })),
      401,
      { error: 'bad token' },
    ],
    [
      'a resolver that breaks with a 500 that says nothing of it',
      Effect.die(new Error('the session store password')),
      500,
      { error: 'Internal error' },
    ],
    [
      'a resolver that throws as one that breaks',
      'throws' as const,
      500,
      { error: 'Internal error' },
    ],
  ])('answers %s, opening nothing', async (_, resolved, status, answer) => {
    const { Host, opens } = host({
      resolvePrincipal: () => {
        if (resolved === 'throws') throw new Error('the session store password')
        return resolved
      },
    })
    const served = new Host({}, undefined)
    const response = await served.fetch(
      new Request('http://host/sync', { headers: { Upgrade: 'websocket' } }),
    )
    expect(response.status).toBe(status)
    expect(await response.json()).toEqual(answer)
    expect(opens()).toBe(0)
  })

  it('answers a journal that never opened with a 500 that says nothing, then retries', async () => {
    let attempts = 0
    const { Host, pairs } = host({
      openJournal: async () => {
        attempts += 1
        if (attempts === 1) throw new Error('the D1 password')
        return openJournal()
      },
    })
    const served = new Host({}, undefined)
    const failed = await served.fetch(
      new Request('http://host/sync', { headers: { Upgrade: 'websocket' } }),
    )
    expect(failed.status).toBe(500)
    expect(await failed.json()).toEqual({ error: 'Internal error' })
    const { response } = await upgrade(served.fetch.bind(served), pairs, 'ada')
    expect(response.status).toBe(101)
    expect(attempts).toBe(2)
  })

  it('notifies every open socket of a commit', async () => {
    const { Host, pairs } = host()
    const served = new Host({}, undefined)
    const first = await upgrade(served.fetch.bind(served), pairs, 'ada')
    const second = await upgrade(served.fetch.bind(served), pairs, 'grace')
    const heard: Array<string> = []
    second.client.addEventListener('message', event => {
      if (typeof event.data === 'string') heard.push(event.data)
    })
    const pending = await pendingOf('a', ['Milk'])
    await roundTrip(first.client, { id: '1', cursor: 0, pending })
    await expect.poll(() => heard.some(raw => raw === JSON.stringify({ notify: true }))).toBe(true)
  })

  it('runs settle with the environment and journal after an exchange appends', async () => {
    const env = { tag: 'test-env' }
    const seen: Array<unknown> = []
    const journals: Array<unknown> = []
    const { Host, pairs } = host({
      settle: (received, journal) =>
        Effect.sync(() => {
          seen.push(received)
          journals.push(journal)
        }),
    })
    const served = new Host({}, env)
    const { client } = await upgrade(served.fetch.bind(served), pairs, 'ada')
    const pending = await pendingOf('a', ['Milk'])
    const sent = resultOf(await roundTrip(client, { id: '1', cursor: 0, pending }))
    expect(sent.acknowledged).toHaveLength(1)
    expect(seen).toEqual([env])
    const again = resultOf(await roundTrip(client, { id: '2', cursor: 0, pending: [] }))
    expect(again.operations).toHaveLength(1)
    expect(seen).toEqual([env, env])
    expect(journals).toHaveLength(2)
    expect(journals[0]).toBe(journals[1])
  })
})

describe('defineDocumentHost, asking who a socket serves again', () => {
  it('refuses an interval that is not longer than zero', () => {
    expect(() => host({ revalidate: { every: '0 millis' } })).toThrow(
      'revalidate.every must be longer than zero',
    )
  })

  const revalidating = () => {
    const sessions = new Map<string, string>([['ada', 'ada']])
    let asked = 0
    const hosted = host({
      resolvePrincipal: request => {
        asked += 1
        const principal = sessions.get(request.headers.get('x-actor') ?? '')
        return principal === undefined
          ? Effect.fail(new RemoteUnauthenticated({ message: 'Session revoked' }))
          : Effect.succeed(principal)
      },
      revalidate: { every: '10 millis', key: principal => principal },
      lingering: true,
    })
    return { ...hosted, sessions, asked: () => asked }
  }

  const settled = async (done: () => boolean): Promise<void> => {
    for (let waited = 0; !done(); waited += 5) {
      if (waited > 2000) throw new Error('timed out')
      await new Promise(resolve => setTimeout(resolve, 5))
    }
  }

  it.each([
    [
      'closes a socket whose session was revoked with 4401',
      (sessions: Map<string, string>) => sessions.delete('ada'),
      { code: 4401, reason: 'Session revoked' },
    ],
    [
      'closes a socket whose session now names someone else with 1012',
      (sessions: Map<string, string>) => sessions.set('ada', 'grace'),
      { code: 1012, reason: 'Who is asking changed' },
    ],
  ])('%s', async (_, change, closed) => {
    const { Host, pairs, sessions } = revalidating()
    const served = new Host({}, undefined)
    await upgrade(served.fetch.bind(served), pairs, 'ada')
    change(sessions)
    const server = pairs[0]![1]
    await settled(() => server.closed !== undefined)
    expect(server.closed).toEqual(closed)
  })

  it('answers no exchange that arrives after it closed a socket', async () => {
    const { Host, pairs, sessions } = revalidating()
    const served = new Host({}, undefined)
    const { client } = await upgrade(served.fetch.bind(served), pairs, 'ada')
    sessions.delete('ada')
    await settled(() => pairs[0]![1].closed !== undefined)
    let answered = false
    client.addEventListener('message', () => {
      answered = true
    })
    // In flight from the replica before it saw the close, as a worker's peer may be.
    client.send(JSON.stringify({ id: 'late', cursor: 0, pending: [] }))
    // An exchange that ran would have answered well within this.
    await new Promise(resolve => setTimeout(resolve, 100))
    expect(answered).toBe(false)
  })

  it('serves on while the session answers as the same principal, and stops asking once closed', async () => {
    const { Host, pairs, asked } = revalidating()
    const served = new Host({}, undefined)
    const { client } = await upgrade(served.fetch.bind(served), pairs, 'ada')
    // The upgrade, then three checks: each found the same principal.
    await settled(() => asked() >= 4)
    expect(pairs[0]![1].closed).toBeUndefined()
    const reply = await roundTrip(client, { id: '1', cursor: 0, pending: [] })
    expect(reply.error).toBeUndefined()
    client.close()
    const after = asked()
    // Ten intervals: a check still running would have asked again in each.
    await new Promise(resolve => setTimeout(resolve, 100))
    expect(asked()).toBe(after)
  })
})

describe("defineDocumentHost, the resolver's layer", () => {
  class Sessions extends Context.Service<
    Sessions,
    { readonly who: (token: string) => Effect.Effect<string, RemoteUnauthenticated> }
  >()('do-test/Sessions') {}

  /** A host whose resolver reads `Sessions`, from a layer that logs its life. */
  /** What breaks after the layer is built, each a 500 that must release it. */
  type Breaks = 'nothing' | 'resolver' | 'journal' | 'opens' | 'layer' | 'layer function'

  const withSessions = (revoked: Set<string>, breaks: Breaks = 'nothing') => {
    const log: Array<string> = []
    const reported: Array<Diagnostic> = []
    const pairs: Array<readonly [FakeWebSocket, FakeWebSocket]> = []
    const sessions = Layer.effect(
      Sessions,
      Effect.acquireRelease(
        Effect.sync(() => {
          log.push('acquire')
          return {
            who: (token: string) =>
              revoked.has(token)
                ? Effect.fail(new RemoteUnauthenticated({ message: 'Session revoked' }))
                : Effect.succeed(token),
          }
        }),
        () => Effect.sync(() => void log.push('release')),
      ),
    )
    const Host = defineDocumentHost(FakeBase, {
      sync: Todos,
      openJournal: async () => {
        if (breaks === 'journal') throw new Error('no storage')
        return openJournal()
      },
      resolvePrincipal: request =>
        breaks === 'resolver'
          ? Effect.die(new Error('the session store password'))
          : Effect.flatMap(Sessions, sessions =>
              sessions.who(request.headers.get('x-actor') ?? ''),
            ),
      layer: () => {
        if (breaks === 'layer function') throw new Error('no binding')
        // Acquired, then a later part fails: what was acquired is released.
        return breaks === 'layer'
          ? Layer.merge(sessions, Layer.effectDiscard(Effect.die(new Error('no pool'))))
          : sessions
      },
      ...(breaks === 'opens'
        ? {
            opens: () => {
              throw new Error('the membership store')
            },
          }
        : {}),
      revalidate: { every: '10 millis' },
      pair: () => {
        const pair = FakeWebSocket.linked({ lingering: true })
        pairs.push(pair)
        return pair as unknown as readonly [WebSocket, AcceptingWebSocket]
      },
      diagnostics: diagnostic => Effect.sync(() => void reported.push(diagnostic)),
    })
    return { Host, pairs, log, reported }
  }

  const settledOn = async (done: () => boolean): Promise<void> => {
    for (let waited = 0; !done(); waited += 5) {
      if (waited > 2000) throw new Error('timed out')
      await new Promise(resolve => setTimeout(resolve, 5))
    }
  }

  it.each([
    ['a layer that fails to build', 'layer', ['acquire', 'release'], 'Resolve', 'no pool'],
    ['a layer function that throws', 'layer function', [], 'Resolve', 'no binding'],
    [
      'a resolver that dies',
      'resolver',
      ['acquire', 'release'],
      'Resolve',
      'the session store password',
    ],
    ['a journal that never opens', 'journal', ['acquire', 'release'], 'Journal', 'no storage'],
    ['an opens that throws', 'opens', ['acquire', 'release'], 'Exchange', 'the membership store'],
  ] as const)(
    'answers %s with a 500, releasing what it built, and reports it',
    async (_, breaks, released, stage, cause) => {
      const { Host, log, reported } = withSessions(new Set(), breaks)
      const served = new Host({}, undefined)
      const response = await served.fetch(
        new Request('http://host/sync', { headers: { Upgrade: 'websocket', 'x-actor': 'ada' } }),
      )
      expect(response.status).toBe(500)
      expect(await response.json()).toEqual({ error: 'Internal error' })
      await settledOn(() => log.length === released.length)
      await new Promise(resolve => setTimeout(resolve, 10))
      expect(log).toEqual(released)
      expect(reported).toEqual([
        expect.objectContaining({ _tag: 'HostDefect', level: 'error', stage }),
      ])
      expect(reported[0]!.message).toContain(cause)
    },
  )

  it('keeps it while the socket is open, and closes it with the socket', async () => {
    const { Host, pairs, log } = withSessions(new Set())
    const served = new Host({}, undefined)
    const { client } = await upgrade(served.fetch.bind(served), pairs, 'ada')
    expect(resultOf(await roundTrip(client, { id: '1', cursor: 0, pending: [] })).rejected).toEqual(
      [],
    )
    expect(log).toEqual(['acquire'])
    client.close()
    await settledOn(() => log.length === 2)
    expect(log).toEqual(['acquire', 'release'])
  })

  it('closes it at once for an upgrade it refuses', async () => {
    const { Host, log } = withSessions(new Set(['mallory']))
    const served = new Host({}, undefined)
    const response = await served.fetch(
      new Request('http://host/sync', { headers: { Upgrade: 'websocket', 'x-actor': 'mallory' } }),
    )
    expect(response.status).toBe(401)
    await settledOn(() => log.length === 2)
    expect(log).toEqual(['acquire', 'release'])
  })

  it('asks it again while open, and closes it once with a revoked socket', async () => {
    const revoked = new Set<string>()
    const { Host, pairs, log } = withSessions(revoked)
    const served = new Host({}, undefined)
    const { client } = await upgrade(served.fetch.bind(served), pairs, 'ada')
    revoked.add('ada')
    await settledOn(() => pairs[0]![1].closed !== undefined)
    expect(pairs[0]![1].closed).toEqual({ code: 4401, reason: 'Session revoked' })
    await settledOn(() => log.length === 2)
    // The replica answers the close; nothing is released twice.
    client.close()
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(log).toEqual(['acquire', 'release'])
  })
})

describe('documentHost, for a runtime of its own', () => {
  const answering = (sessions: Map<string, string>) =>
    documentHost({
      sync: Todos,
      journal: async () => openJournal(),
      resolvePrincipal: request => {
        const principal = sessions.get(request.headers.get('x-actor') ?? '')
        return principal === undefined
          ? Effect.fail(new RemoteUnauthenticated({ message: 'Sign in.' }))
          : Effect.succeed(principal)
      },
      revalidate: { every: '10 millis' },
    })
  const asking = (actor: string) =>
    new Request('http://host/sync', { headers: { Upgrade: 'websocket', 'x-actor': actor } })

  it('refuses before any socket opens, with the answer to send', async () => {
    const answered = await answering(new Map())(asking('ada'))
    expect(Result.isFailure(answered)).toBe(true)
    const response = Result.match(answered, { onFailure: r => r, onSuccess: () => undefined })!
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Sign in.' })
  })

  it('releases what an accepted upgrade built once it is abandoned, a socket never opened', async () => {
    class Store extends Context.Service<Store, { readonly who: string }>()('do-test/Store') {}
    const log: Array<string> = []
    const host = documentHost({
      sync: Todos,
      journal: async () => openJournal(),
      resolvePrincipal: () => Effect.map(Store, ({ who }) => who),
      layer: () =>
        Layer.effect(
          Store,
          Effect.acquireRelease(
            Effect.sync(() => {
              log.push('acquire')
              return { who: 'ada' }
            }),
            () => Effect.sync(() => void log.push('release')),
          ),
        ),
    })
    const answered = await host(asking('ada'))
    const accepted = Result.match(answered, { onFailure: () => undefined, onSuccess: a => a })!
    expect(log).toEqual(['acquire'])
    accepted.abandon()
    for (let waited = 0; log.length < 2; waited += 5) {
      if (waited > 2000) throw new Error('timed out')
      await new Promise(resolve => setTimeout(resolve, 5))
    }
    expect(log).toEqual(['acquire', 'release'])
  })

  it('closes with the code alone when the platform refuses the reason', async () => {
    const sessions = new Map([['ada', 'ada']])
    const answered = await answering(sessions)(asking('ada'))
    const { serve } = Result.match(answered, { onFailure: () => undefined, onSuccess: a => a })!
    const [, server] = FakeWebSocket.linked({ lingering: true })
    let closedPlainly = false
    serve({
      ...workerSocket(server as unknown as WebSocket),
      closeWith: () => {
        throw new RangeError('The message must not be greater than 123 bytes')
      },
      close: () => {
        closedPlainly = true
      },
    })
    sessions.delete('ada')
    for (let waited = 0; !closedPlainly; waited += 5) {
      if (waited > 2000) throw new Error('timed out')
      await new Promise(resolve => setTimeout(resolve, 5))
    }
    expect(closedPlainly).toBe(true)
  })

  it('serves a socket it accepted, and closes it with its own code once refused', async () => {
    const sessions = new Map([['ada', 'ada']])
    const answered = await answering(sessions)(asking('ada'))
    const { serve } = Result.match(answered, { onFailure: () => undefined, onSuccess: s => s })!
    const [client, server] = FakeWebSocket.linked({ lingering: true })
    const closed: Array<readonly [number, string]> = []
    serve({
      ...workerSocket(server as unknown as WebSocket),
      closeWith: (code, reason) => closed.push([code, reason]),
    })
    const pending = await pendingOf('a', ['Milk'])
    const sent = resultOf(await roundTrip(client, { id: '1', cursor: 0, pending }))
    expect(sent.acknowledged).toHaveLength(1)
    sessions.delete('ada')
    for (let waited = 0; closed.length === 0; waited += 5) {
      if (waited > 2000) throw new Error('timed out')
      await new Promise(resolve => setTimeout(resolve, 5))
    }
    expect(closed).toEqual([[4401, 'Sign in.']])
  })
})

describe('defineDocumentHost with reactions', () => {
  const Note = Schema.Struct({ id: Schema.String, noticed: Schema.Boolean })
  const NoteModel = Schema.Struct({ notes: Schema.Array(Note) })
  type NoteModel = typeof NoteModel.Type
  const NoteMessage = defineMessageUnion({
    Wrote: { id: Schema.String },
    Noticed: { id: Schema.String },
  })
  type NoteMessage = typeof NoteMessage.Type
  const NotesApp = Surface.application({
    Model: NoteModel,
    Message: NoteMessage,
    initial: { notes: [] },
    update: (model: NoteModel, message: NoteMessage): Update.Return<NoteModel, NoteMessage> =>
      NoteMessage.match<Update.Return<NoteModel, NoteMessage>>(message, {
        Wrote: ({ id }) => ({ model: { notes: [...model.notes, { id, noticed: false }] } }),
        Noticed: ({ id }) => ({
          model: {
            notes: model.notes.map(note => (note.id === id ? { ...note, noticed: true } : note)),
          },
        }),
      }),
  })
  const Wrote = MessageSet.make(NotesApp, [NoteMessage.Wrote])
  const Noticed = MessageSet.make(NotesApp, [NoteMessage.Noticed])
  const Notes = Sync.forApplication(NotesApp).make({
    documentId: documentId('notes'),
    shared: Projection.pick(NotesApp.model.notes),
    durable: Wrote,
    serverOnly: Noticed,
  })
  type NotesShared = Parameters<typeof Notes.replay>[0]

  const folders: Array<string> = []
  afterEach(() => {
    for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
  })
  const notesFile = () => {
    const folder = mkdtempSync(join(tmpdir(), 'do-reactions-'))
    folders.push(folder)
    return join(folder, 'notes.sqlite')
  }
  const openNotes = (file: string) =>
    Effect.runSync(
      Journal.make<Operation, NotesShared, string>({
        ...Notes.journalContract(),
        file,
        opId: operation => OpId.make(operation.opId),
        actorId: principal => ActorId.make(principal),
      }).pipe(Effect.provideService(Scope.Scope, openScope())),
    )

  /** An object's storage holding its one alarm. */
  const alarmStorage = () => {
    const state = { alarm: null as number | null, sets: 0 }
    return {
      state,
      getAlarm: async () => state.alarm,
      setAlarm: async (at: number) => {
        state.sets += 1
        state.alarm = at
      },
    }
  }

  const hostOf = (
    file: string,
    run: (trigger: {
      readonly key: string
      readonly message: { readonly id: string }
    }) => Effect.Effect<void, unknown>,
    reported: Array<Diagnostic> = [],
  ) => {
    const pairs: Array<readonly [FakeWebSocket, FakeWebSocket]> = []
    const notice = reaction(Notes, {
      name: 'notice',
      on: Wrote,
      appends: Noticed,
      run: trigger =>
        run(trigger).pipe(Effect.as([NoteMessage.Noticed({ id: trigger.message.id })])),
    })
    const Host = defineDocumentHost(FakeBase, {
      sync: Notes,
      openJournal: async () => openNotes(file),
      resolvePrincipal: request => Effect.succeed(request.headers.get('x-actor') ?? 'anon'),
      server: { principal: 'notes-server', reactions: () => [notice] },
      diagnostics: diagnostic => Effect.sync(() => void reported.push(diagnostic)),
      pair: () => {
        const pair = FakeWebSocket.linked({ lingering: false })
        pairs.push(pair)
        return pair as unknown as readonly [WebSocket, AcceptingWebSocket]
      },
    })
    return { Host, pairs }
  }

  const wrote = async (id: string) => {
    const writer = await Effect.runPromise(
      Notes.openReplica(memoryStorage(), { replicaId: replicaId(`tab-${id}`) }),
    )
    await Effect.runPromise(writer.submit(NoteMessage.Wrote({ id })))
    return Effect.runPromise(writer.pending)
  }

  const tagsIn = (file: string) =>
    Effect.runPromise(openNotes(file).read(JournalDocumentId.make('notes'), Cursor.make(0))).then(
      rows => rows.map(row => (row.operation.message as { readonly _tag: string })._tag),
    )

  it('sets the alarm before the reply, and runs the reaction without holding it', async () => {
    const file = notesFile()
    const calls: Array<string> = []
    let release = (): void => undefined
    const released = new Promise<void>(resolve => (release = resolve))
    const { Host, pairs } = hostOf(file, ({ key: runKey }) =>
      Effect.sync(() => void calls.push(runKey)).pipe(
        Effect.andThen(Effect.promise(() => released)),
      ),
    )
    const storage = alarmStorage()
    const served = new Host({ storage }, undefined)
    const { client } = await upgrade(served.fetch.bind(served), pairs, 'ada')
    const reply = resultOf(
      await roundTrip(client, { id: '1', cursor: 0, pending: await wrote('a') }),
    )
    expect(reply.acknowledged).toHaveLength(1)
    // Answered while the reaction still runs, with the alarm already set.
    expect(storage.state.alarm).not.toBeNull()
    await vi.waitFor(() => expect(calls).toHaveLength(1))
    expect(await tagsIn(file)).toEqual(['Wrote'])
    release()
    await vi.waitFor(async () => expect(await tagsIn(file)).toEqual(['Wrote', 'Noticed']))
  })

  it('resumes from the alarm what an evicted object left, with the same key', async () => {
    const file = notesFile()
    const calls: Array<string> = []
    // The first object is evicted mid-run: its handler never finishes.
    const first = hostOf(file, ({ key: runKey }) =>
      Effect.sync(() => void calls.push(runKey)).pipe(Effect.andThen(Effect.never)),
    )
    const storage = alarmStorage()
    const evicted = new first.Host({ storage }, undefined)
    const { client } = await upgrade(evicted.fetch.bind(evicted), first.pairs, 'ada')
    resultOf(await roundTrip(client, { id: '1', cursor: 0, pending: await wrote('a') }))
    await vi.waitFor(() => expect(calls).toHaveLength(1))
    // A new instance, as workerd makes after eviction, over the same storage.
    const second = hostOf(file, ({ key: runKey }) => Effect.sync(() => void calls.push(runKey)))
    await new second.Host({ storage }, undefined).alarm()
    expect(calls).toHaveLength(2)
    expect(calls[1]).toBe(calls[0])
    expect(await tagsIn(file)).toEqual(['Wrote', 'Noticed'])
  })

  it('reports a pass that broke and brings the alarm back, never throwing', async () => {
    const reported: Array<Diagnostic> = []
    const storage = alarmStorage()
    const Host = defineDocumentHost(FakeBase, {
      sync: Notes,
      openJournal: async () => {
        throw new Error('D1 is down')
      },
      resolvePrincipal: () => Effect.succeed('ada'),
      server: { principal: 'notes-server', reactions: () => [] },
      diagnostics: diagnostic => Effect.sync(() => void reported.push(diagnostic)),
    })
    const before = Date.now()
    await new Host({ storage }, undefined).alarm()
    expect(reported).toEqual([expect.objectContaining({ _tag: 'HostDefect', stage: 'Alarm' })])
    expect(storage.state.alarm).toBeGreaterThanOrEqual(before + 30_000)
  })

  it('brings an alarm earlier, never later', async () => {
    const file = notesFile()
    const storage = alarmStorage()
    // Sooner than the second the host would set after a commit.
    storage.state.alarm = Date.now() + 800
    const { Host, pairs } = hostOf(file, () => Effect.void)
    const served = new Host({ storage }, undefined)
    const { client } = await upgrade(served.fetch.bind(served), pairs, 'ada')
    const soon = storage.state.alarm
    resultOf(await roundTrip(client, { id: '1', cursor: 0, pending: await wrote('a') }))
    await vi.waitFor(async () => expect(await tagsIn(file)).toEqual(['Wrote', 'Noticed']))
    expect(storage.state.alarm).toBe(soon)
  })

  it('arms the alarm for what committed even when settle fails', async () => {
    const file = notesFile()
    const storage = alarmStorage()
    const pairs: Array<readonly [FakeWebSocket, FakeWebSocket]> = []
    const Host = defineDocumentHost(FakeBase, {
      sync: Notes,
      openJournal: async () => openNotes(file),
      resolvePrincipal: () => Effect.succeed('ada'),
      settle: () => Effect.fail(new Error('the table is down')),
      server: {
        principal: 'notes-server',
        reactions: () => [reaction(Notes, { name: 'notice', on: Wrote, run: () => Effect.void })],
      },
      pair: () => {
        const pair = FakeWebSocket.linked({ lingering: false })
        pairs.push(pair)
        return pair as unknown as readonly [WebSocket, AcceptingWebSocket]
      },
    })
    const served = new Host({ storage }, undefined)
    const { client } = await upgrade(served.fetch.bind(served), pairs, 'ada')
    const reply = await roundTrip(client, { id: '1', cursor: 0, pending: await wrote('a') })
    expect(reply.error).toBeDefined()
    expect(storage.state.alarm).not.toBeNull()
  })

  it('runs one pass at a time, so a failure is counted once', async () => {
    const file = notesFile()
    let calls = 0
    const { Host } = hostOf(file, () =>
      Effect.suspend(() => {
        calls += 1
        return Effect.fail(new Error('down'))
      }),
    )
    const journal = openNotes(file)
    const writer = await Effect.runPromise(
      Notes.openReplica(memoryStorage(), { replicaId: replicaId('tab') }),
    )
    await Effect.runPromise(writer.submit(NoteMessage.Wrote({ id: 'a' })))
    const served = new Host({ storage: alarmStorage() }, undefined)
    // Registered by the first alarm's open, then the commit, then two alarms at once.
    await served.alarm()
    const [pending] = await Effect.runPromise(writer.pending)
    await Effect.runPromise(journal.append(JournalDocumentId.make('notes'), pending!, 'ada'))
    await Promise.all([served.alarm(), served.alarm()])
    expect(calls).toBe(1)
    const tracked = Effect.runSync(
      openNotes(file).cursors.settled(JournalDocumentId.make('notes'), 'react/notice'),
    )
    expect(Option.map(tracked, at => at.attempts)).toEqual(Option.some(1))
  })

  it('re-arms from inside alarm() though the runtime still answers the alarm being run', async () => {
    const file = notesFile()
    let calls = 0
    const { Host } = hostOf(file, () =>
      Effect.suspend(() => {
        calls += 1
        return calls === 1 ? Effect.fail(new Error('down')) : Effect.void
      }),
    )
    const storage = alarmStorage()
    const served = new Host({ storage }, undefined)
    await served.alarm()
    const writer = await Effect.runPromise(
      Notes.openReplica(memoryStorage(), { replicaId: replicaId('tab') }),
    )
    await Effect.runPromise(writer.submit(NoteMessage.Wrote({ id: 'a' })))
    const [pending] = await Effect.runPromise(writer.pending)
    await Effect.runPromise(
      openNotes(file).append(JournalDocumentId.make('notes'), pending!, 'ada'),
    )
    // The alarm being run, as workerd may still report it.
    storage.state.alarm = Date.now() - 1
    await served.alarm()
    expect(calls).toBe(1)
    expect(storage.state.alarm).toBeGreaterThan(Date.now())
  })

  it('reports a failed setAlarm after a commit, still settles, and arms on the next exchange', async () => {
    const file = notesFile()
    const reported: Array<Diagnostic> = []
    const storage = alarmStorage()
    let broken = true
    const failing = {
      ...storage,
      setAlarm: async (at: number) => {
        if (broken) throw new Error('storage is down')
        return storage.setAlarm(at)
      },
    }
    let settled = 0
    const pairs: Array<readonly [FakeWebSocket, FakeWebSocket]> = []
    const Host = defineDocumentHost(FakeBase, {
      sync: Notes,
      openJournal: async () => openNotes(file),
      resolvePrincipal: () => Effect.succeed('ada'),
      settle: () => Effect.sync(() => void (settled += 1)),
      server: {
        principal: 'notes-server',
        reactions: () => [reaction(Notes, { name: 'notice', on: Wrote, run: () => Effect.void })],
      },
      diagnostics: diagnostic => Effect.sync(() => void reported.push(diagnostic)),
      pair: () => {
        const pair = FakeWebSocket.linked({ lingering: false })
        pairs.push(pair)
        return pair as unknown as readonly [WebSocket, AcceptingWebSocket]
      },
    })
    const served = new Host({ storage: failing }, undefined)
    const { client } = await upgrade(served.fetch.bind(served), pairs, 'ada')
    resultOf(await roundTrip(client, { id: '1', cursor: 0, pending: await wrote('a') }))
    expect(settled).toBe(1)
    expect(reported).toContainEqual(expect.objectContaining({ _tag: 'HostDefect', stage: 'Alarm' }))
    broken = false
    resultOf(await roundTrip(client, { id: '2', cursor: 1, pending: [] }))
    expect(storage.state.alarm).not.toBeNull()
  })

  it('runs the base class’s own alarm after the reactions, and opens nothing without `server`', async () => {
    const order: Array<string> = []
    class AlarmedBase extends FakeBase {
      async alarm(): Promise<void> {
        order.push('base')
      }
    }
    let opens = 0
    const Plain = defineDocumentHost(AlarmedBase, {
      sync: Notes,
      openJournal: async () => {
        opens += 1
        return openNotes(notesFile())
      },
      resolvePrincipal: () => Effect.succeed('ada'),
    })
    await new Plain({}, undefined).alarm()
    expect(order).toEqual(['base'])
    expect(opens).toBe(0)
  })

  it('never throws from alarm() when the reporter fails too', async () => {
    const Host = defineDocumentHost(FakeBase, {
      sync: Notes,
      openJournal: async () => {
        throw new Error('D1 is down')
      },
      resolvePrincipal: () => Effect.succeed('ada'),
      server: { principal: 'notes-server', reactions: () => [] },
      diagnostics: () => Effect.die(new Error('the reporter broke')),
    })
    await expect(new Host({ storage: alarmStorage() }, undefined).alarm()).resolves.toBeUndefined()
  })

  it('refuses a reaction of another contract when the class is made', () => {
    const Twin = Sync.forApplication(NotesApp).make({
      documentId: documentId('notes'),
      shared: Projection.pick(NotesApp.model.notes),
      durable: Wrote,
      serverOnly: Noticed,
    })
    const Host = defineDocumentHost(FakeBase, {
      sync: Notes,
      openJournal: async () => openNotes(notesFile()),
      resolvePrincipal: () => Effect.succeed('ada'),
      server: {
        principal: 'notes-server',
        reactions: () => [reaction(Twin, { name: 'twin', on: Wrote, run: () => Effect.void })],
      },
    })
    expect(() => new Host({ storage: alarmStorage() }, undefined)).toThrow('another contract')
  })

  it('refuses `server` without the object’s alarm', () => {
    const { Host } = hostOf(notesFile(), () => Effect.void)
    expect(() => new Host({}, undefined)).toThrow('alarm')
  })
})
