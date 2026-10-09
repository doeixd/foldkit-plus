// @vitest-environment node
/**
 * `defineDocumentHost`: one Durable Object serving a document's Sync
 * exchange. Non-upgrades are 404s that open nothing, each upgrade resolves
 * its own principal and shares the one journal, and commits reach every
 * open socket as notices.
 */
import { ActorId, Journal, OpId } from 'foldkit-durable'
import { Effect, Scope } from 'effect'
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
    readonly refuse?: (operation: Operation) => boolean
    readonly resolvePrincipal?: (request: Request) => string
    readonly openJournal?: () => Promise<TestJournal>
    readonly settle?: (env: unknown, journal: unknown) => Effect.Effect<void, unknown>
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
      options.resolvePrincipal ?? (request => request.headers.get('x-actor') ?? 'anon'),
    refuse: options.refuse,
    settle: options.settle,
    pair: () => {
      const pair = FakeWebSocket.linked()
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
    const { Host, pairs } = host({ refuse: () => true })
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

  it('answers a throwing principal resolution with a 401 carrying its message', async () => {
    const { Host, opens } = host({
      resolvePrincipal: () => {
        throw new Error('bad token')
      },
    })
    const served = new Host({}, undefined)
    const response = await served.fetch(
      new Request('http://host/sync', { headers: { Upgrade: 'websocket' } }),
    )
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'bad token' })
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
