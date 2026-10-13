// @vitest-environment node
/**
 * `defineDocumentHost`: one Durable Object serving a document's Sync
 * exchange. Non-upgrades are 404s that open nothing, each upgrade resolves
 * its own principal and shares the one journal, and commits reach every
 * open socket as notices.
 */
import { ActorId, Journal, OpId } from 'foldkit-durable'
import { Context, Effect, Layer, Scope, type Duration } from 'effect'
import { RemoteUnauthenticated } from 'foldkit-remote'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Sync, type Operation } from '../src/index.js'
import { defineDocumentHost, type AcceptingWebSocket } from '../src/do.js'
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
  const withSessions = (revoked: Set<string>) => {
    const log: Array<string> = []
    const pairs: Array<readonly [FakeWebSocket, FakeWebSocket]> = []
    const Host = defineDocumentHost(FakeBase, {
      sync: Todos,
      openJournal: async () => openJournal(),
      resolvePrincipal: request =>
        Effect.flatMap(Sessions, sessions => sessions.who(request.headers.get('x-actor') ?? '')),
      layer: () =>
        Layer.effect(
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
        ),
      revalidate: { every: '10 millis' },
      pair: () => {
        const pair = FakeWebSocket.linked({ lingering: true })
        pairs.push(pair)
        return pair as unknown as readonly [WebSocket, AcceptingWebSocket]
      },
    })
    return { Host, pairs, log }
  }

  const settledOn = async (done: () => boolean): Promise<void> => {
    for (let waited = 0; !done(); waited += 5) {
      if (waited > 2000) throw new Error('timed out')
      await new Promise(resolve => setTimeout(resolve, 5))
    }
  }

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
