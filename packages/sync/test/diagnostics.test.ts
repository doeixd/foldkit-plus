// @vitest-environment node
/**
 * What Sync reports on the Diagnostics channel: a replica's failed exchange
 * and rebuilt history, a document host's failures answered "Internal error"
 * (or 1011, or a notice unsent), and a listener the application gave that
 * threw. Each with the facts behind it, to the reporter the host or the
 * context gives.
 */
import { Effect, Exit, Result } from 'effect'
import { DocumentId } from 'foldkit-durable'
import { Diagnostics, type Diagnostic } from 'foldkit-surface'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Sync } from '../src/index.js'
import { defineDocumentHost, type AcceptingWebSocket } from '../src/do.js'
import { documentHost, journalExchange } from '../src/journal.js'
import { layerSocket, Transport, type SocketLike } from '../src/transport.js'
import { Message, Todos, closeScopes, openJournal, pendingOf, replica } from './fixtures/todos.js'
import { socketPair } from './sockets.js'

afterEach(() => {
  closeScopes()
  vi.unstubAllGlobals()
})

/** Every report with the URL of the request it was given beside it. */
const collecting = () => {
  const reported: Array<{ readonly diagnostic: Diagnostic; readonly url: string }> = []
  return {
    reported,
    diagnostics: (diagnostic: Diagnostic, request: Request) =>
      Effect.sync(() => void reported.push({ diagnostic, url: request.url })),
  }
}

const until = async (done: () => boolean): Promise<void> => {
  for (let waited = 0; !done(); waited += 5) {
    if (waited > 2000) throw new Error('timed out')
    await new Promise(resolve => setTimeout(resolve, 5))
  }
}

const upgrade = new Request('http://host/sync', { headers: { Upgrade: 'websocket' } })

describe('a replica', () => {
  it('reports a failed exchange, with what failed, as status.lastError says it', async () => {
    const collected = Diagnostics.collect()
    const writer = await replica('a')
    await Effect.runPromise(writer.submit(Message.CreatedTodo({ id: 'a0', title: 'Milk' })))
    const exit = await Effect.runPromiseExit(
      writer.synchronize.pipe(
        Effect.provide(
          Sync.transport.fromPromise({
            exchange: () => Promise.reject(new Error('offline')),
          }),
        ),
        Effect.provideService(Diagnostics.Reporter, collected.report),
      ),
    )
    expect(Exit.isFailure(exit)).toBe(true)
    expect(collected.reported).toEqual([
      expect.objectContaining({
        _tag: 'ExchangeFailed',
        source: 'foldkit-sync',
        level: 'warning',
        documentId: 'todos',
        error: expect.objectContaining({ _tag: 'SyncTransportError' }),
      }),
    ])
    expect(Effect.runSync(writer.status).lastError).toBeDefined()
  })

  it('reports a history the server reset under it, and only then', async () => {
    const collected = Diagnostics.collect()
    const journal = openJournal()
    const exchange = Sync.transport.fromPromise(
      journalExchange({ sync: Todos, journal, principal: 'ada' }),
    )
    const reader = await replica('b')
    const synchronize = reader.synchronize.pipe(
      Effect.provide(exchange),
      Effect.provideService(Diagnostics.Reporter, collected.report),
    )
    await Effect.runPromise(synchronize)
    await Effect.runPromise(synchronize)
    expect(collected.reported).toEqual([])
    Effect.runSync(journal.reset(DocumentId.make('todos')))
    await Effect.runPromise(synchronize)
    expect(collected.reported).toEqual([
      expect.objectContaining({ _tag: 'HistoryRebuilt', level: 'warning', documentId: 'todos' }),
    ])
  })
})

describe('a document host', () => {
  it('reports a socket pair it could not make, with the request', async () => {
    const { reported, diagnostics } = collecting()
    const Host = defineDocumentHost(class {}, {
      sync: Todos,
      openJournal: async () => openJournal(),
      resolvePrincipal: () => Effect.succeed('ada'),
      diagnostics,
    })
    const response = await new Host({}, undefined).fetch(upgrade)
    expect(response.status).toBe(500)
    expect(reported).toEqual([
      {
        diagnostic: expect.objectContaining({
          _tag: 'HostDefect',
          source: 'foldkit-sync',
          level: 'error',
          stage: 'Upgrade',
        }),
        url: 'http://host/sync',
      },
    ])
    expect(reported[0]!.diagnostic.message).toContain('no WebSocketPair global')
  })

  it('reports a server end it could not accept', async () => {
    const { reported, diagnostics } = collecting()
    const { client, server } = socketPair()
    const Host = defineDocumentHost(class {}, {
      sync: Todos,
      openJournal: async () => openJournal(),
      resolvePrincipal: () => Effect.succeed('ada'),
      diagnostics,
      pair: () => [
        client as unknown as WebSocket,
        {
          ...server,
          accept: () => {
            throw new Error('already accepted')
          },
        } as unknown as AcceptingWebSocket,
      ],
    })
    expect((await new Host({}, undefined).fetch(upgrade)).status).toBe(500)
    expect(reported.map(({ diagnostic }) => diagnostic)).toEqual([
      expect.objectContaining({ _tag: 'HostDefect', stage: 'Upgrade' }),
    ])
  })

  it('reports a resolver that died on revalidation, and closes with 1011', async () => {
    const { reported, diagnostics } = collecting()
    let asked = 0
    const host = documentHost({
      sync: Todos,
      journal: async () => openJournal(),
      resolvePrincipal: () =>
        (asked += 1) === 1 ? Effect.succeed('ada') : Effect.die(new Error('store down')),
      revalidate: { every: '5 millis' },
      diagnostics,
    })
    const answered = await host(upgrade)
    const { serve } = Result.getOrThrow(answered)
    const closed: Array<number> = []
    serve({ ...socketPair().server, closeWith: code => void closed.push(code) })
    await until(() => reported.length > 0)
    expect(closed).toEqual([1011])
    expect(reported).toEqual([
      {
        diagnostic: expect.objectContaining({ _tag: 'HostDefect', stage: 'Revalidate' }),
        url: 'http://host/sync',
      },
    ])
    expect(reported[0]!.diagnostic.message).toContain('store down')
  })

  it('reports an opens that failed before a notice, and sends that socket none', async () => {
    const { reported, diagnostics } = collecting()
    const host = documentHost({
      sync: Todos,
      journal: (() => {
        const journal = openJournal()
        return async () => journal
      })(),
      resolvePrincipal: request => Effect.succeed(request.headers.get('x-actor') ?? ''),
      opens: principal =>
        principal === 'grace' ? Effect.die(new Error('membership down')) : Effect.succeed(true),
      diagnostics,
    })
    const as = (actor: string) =>
      new Request('http://host/sync', { headers: { Upgrade: 'websocket', 'x-actor': actor } })
    const serving = async (actor: string) => {
      const { client, server } = socketPair()
      Result.getOrThrow(await host(as(actor))).serve({ ...server, closeWith: () => {} })
      const heard: Array<string> = []
      client.onMessage(data => heard.push(data))
      return { client, heard }
    }
    const ada = await serving('ada')
    const grace = await serving('grace')
    const bob = await serving('bob')
    ada.client.send(JSON.stringify({ id: '1', cursor: 0, pending: await pendingOf('a', ['Milk']) }))
    // Bob is asked after Grace, so once he has heard the notice, Grace's answer has landed.
    await until(() => reported.length > 0 && bob.heard.length > 0)
    expect(grace.heard).toEqual([])
    expect(reported.map(({ diagnostic }) => diagnostic)).toEqual([
      expect.objectContaining({ _tag: 'HostDefect', stage: 'Notice' }),
    ])
  })
})

describe('a listener that throws', () => {
  it("on the replica's socket is reported, and the others still hear the frame", async () => {
    const collected = Diagnostics.collect()
    const servers: Array<SocketLike> = []
    const makeSocket = (): SocketLike => {
      const { client, server } = socketPair()
      servers.push(server)
      return client
    }
    const heard = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const socket = (yield* Effect.service(Transport)).socket!
          socket.onMessage(() => {
            throw new Error('not mine')
          })
          const heard: Array<string> = []
          socket.onMessage(data => heard.push(data))
          while (servers.length < 1) yield* Effect.sleep('1 millis')
          servers[0]!.send('presence')
          return heard
        }).pipe(Effect.provide(layerSocket({ makeSocket, retryBase: '1 millis' }))),
      ).pipe(Effect.provideService(Diagnostics.Reporter, collected.report)),
    )
    expect(heard).toEqual(['presence'])
    expect(collected.reported).toEqual([
      expect.objectContaining({ _tag: 'ListenerFailed', level: 'error', site: 'Socket' }),
    ])
  })
})
