// @vitest-environment node
/**
 * What a document host tells a caller it could not serve (#576): a refusal's
 * `reason`, written for the caller, or "Unauthenticated", and nothing of its
 * message; a resolver that broke, "Internal error" and an incident, with the
 * cause on the report. Read as the caller receives it: the answer's body, and
 * the close on the replica's end of the socket.
 */
import { Effect, Option, Predicate, Result, Schedule } from 'effect'
import { RemoteUnauthenticated } from 'foldkit-remote'
import type { Diagnostic } from 'foldkit-surface'
import { afterEach, describe, expect, it } from 'vitest'
import { Sync, type SocketLike } from '../src/index.js'
import { documentHost } from '../src/journal.js'
import { workerSocket } from '../src/transport.js'
import { Message, Todos, closeScopes, openJournal, replica } from './fixtures/todos.js'
import { FakeWebSocket } from './sockets.js'

afterEach(closeScopes)

type Resolver = () => Effect.Effect<string, RemoteUnauthenticated>

const CANARY = 'SECRET-CANARY'
const INTERNAL = { error: 'Internal error', incident: expect.stringMatching(/^[0-9a-f]{16}$/) }

/** A refusal with no reason: its message is the resolver's own, for no caller. */
const unexplained: Resolver = () =>
  Effect.fail(new RemoteUnauthenticated({ message: `${CANARY}: no row in sessions for 9f2c` }))
const explained: Resolver = () =>
  Effect.fail(
    new RemoteUnauthenticated({
      message: `${CANARY}: no row in sessions for 9f2c`,
      reason: 'Your session ended.',
    }),
  )
const broken: Resolver = () => Effect.die(new Error(`${CANARY}: ECONNREFUSED 10.0.0.7:6379`))
const mistyped: Resolver = () =>
  // @ts-expect-error a resolver may refuse, with a RemoteUnauthenticated, and no more.
  Effect.fail(new Error(`${CANARY}: ECONNREFUSED 10.0.0.7:6379`))

const asking = () => new Request('http://host/sync', { headers: { Upgrade: 'websocket' } })

const hosting = (resolvePrincipal: Resolver, reported: Array<Diagnostic> = []) =>
  documentHost({
    sync: Todos,
    journal: async () => openJournal(),
    resolvePrincipal,
    revalidate: { every: '10 millis' },
    diagnostics: diagnostic => Effect.sync(() => void reported.push(diagnostic)),
  })

/** Serves an accepted upgrade on a pair of sockets, and answers with the replica's end. */
const opened = async (host: ReturnType<typeof hosting>): Promise<FakeWebSocket> => {
  const { serve } = Result.getOrThrow(await host(asking()))
  const [client, server] = FakeWebSocket.linked({ lingering: true })
  serve({
    ...workerSocket(server as unknown as WebSocket),
    closeWith: (code, reason) => server.close(code, reason),
  })
  return client
}

const incidentOf = (body: unknown): unknown =>
  Predicate.hasProperty(body, 'incident') ? body.incident : undefined

describe('an upgrade the host does not accept', () => {
  it.each([
    ['the reason of a refusal that gives one', explained, 401, { error: 'Your session ended.' }],
    [
      '"Unauthenticated" for a refusal that gives none',
      unexplained,
      401,
      { error: 'Unauthenticated' },
    ],
    ['"Internal error" for a resolver that breaks', broken, 500, INTERNAL],
    ['"Internal error" for a failure that is no refusal', mistyped, 500, INTERNAL],
  ])('is answered %s, and nothing of the rest', async (_, resolver, status, answer) => {
    const reported: Array<Diagnostic> = []
    const response = Result.getOrThrow(Result.flip(await hosting(resolver, reported)(asking())))
    expect(response.status).toBe(status)
    const sent = await response.text()
    expect(JSON.parse(sent)).toEqual(answer)
    expect(sent).not.toContain(CANARY)
    // A refusal is no fault; what broke is reported under the incident the caller was given.
    expect(reported).toEqual(
      status === 401
        ? []
        : [
            expect.objectContaining({
              _tag: 'HostDefect',
              stage: 'Resolve',
              incident: Option.some(incidentOf(JSON.parse(sent))),
              message: expect.stringContaining(CANARY),
            }),
          ],
    )
  })
})

describe('a socket whose principal the host asks again', () => {
  const settled = async (done: () => boolean): Promise<void> => {
    for (let waited = 0; !done(); waited += 5) {
      if (waited > 2000) throw new Error('timed out')
      await new Promise(resolve => setTimeout(resolve, 5))
    }
  }

  /** A host that serves `ada` until `revoke`, then answers as `gone` does. */
  const revocable = (gone: Resolver, reported: Array<Diagnostic> = []) => {
    let revoked = false
    return {
      host: hosting(() => (revoked ? gone() : Effect.succeed('ada')), reported),
      revoke: () => {
        revoked = true
      },
    }
  }

  /** The close as the replica's end of the socket is told it. */
  const closeOf = (client: FakeWebSocket) => {
    let heard:
      | { readonly code: number | undefined; readonly reason: string | undefined }
      | undefined
    client.addEventListener('close', event => {
      heard = { code: event.code, reason: event.reason }
    })
    return () => heard
  }

  // 2 bytes a letter: 200 bytes, where a close reason holds 123.
  const long = 'é'.repeat(100)

  it.each([
    [
      '4401 and "Unauthenticated" for a refusal with no reason',
      unexplained,
      4401,
      'Unauthenticated',
      [],
    ],
    ['4401 and the reason of a refusal that gives one', explained, 4401, 'Your session ended.', []],
    [
      '4401 and a reason cut to what a close carries',
      (): ReturnType<Resolver> =>
        Effect.fail(new RemoteUnauthenticated({ message: long, reason: long })),
      4401,
      // 60 letters and the ellipsis: 123 bytes.
      `${'é'.repeat(60)}…`,
      [],
    ],
    ['1011 for a resolver that breaks', broken, 1011, 'Internal error', ['Revalidate']],
    ['1011 for a failure that is no refusal', mistyped, 1011, 'Internal error', ['Revalidate']],
  ])('is closed with %s', async (_, gone, code, reason, stages) => {
    const reported: Array<Diagnostic> = []
    const { host, revoke } = revocable(gone, reported)
    const heard = closeOf(await opened(host))
    revoke()
    await settled(() => heard() !== undefined && reported.length === stages.length)
    expect(heard()).toEqual({ code, reason })
    expect(reported).toEqual(
      stages.map(stage =>
        expect.objectContaining({
          _tag: 'HostDefect',
          stage,
          incident: Option.none(),
          message: expect.stringContaining(CANARY),
        }),
      ),
    )
  })
})

describe('a replica whose host cannot say who is asking', () => {
  /**
   * A browser's socket to the host: an upgrade the host does not accept closes
   * it, and the page reads nothing of the answer.
   */
  const dial = (host: ReturnType<typeof hosting>, answered: Array<number>): SocketLike => {
    const opens = new Set<() => void>()
    const closes = new Set<() => void>()
    const messages = new Set<(data: string) => void>()
    let open: SocketLike | undefined
    void host(asking()).then(
      Result.match({
        onFailure: response => {
          answered.push(response.status)
          for (const listener of [...closes]) listener()
        },
        onSuccess: ({ serve }) => {
          answered.push(101)
          const [client, server] = FakeWebSocket.linked()
          serve({
            ...workerSocket(server as unknown as WebSocket),
            closeWith: (code, reason) => server.close(code, reason),
          })
          open = workerSocket(client as unknown as WebSocket)
          open.onMessage(data => {
            for (const listener of [...messages]) listener(data)
          })
          open.onClose(() => {
            for (const listener of [...closes]) listener()
          })
          for (const listener of [...opens]) listener()
        },
      }),
    )
    return {
      send: data => open?.send(data),
      close: () => open?.close(),
      onOpen: listener => {
        opens.add(listener)
        return () => opens.delete(listener)
      },
      onMessage: listener => {
        messages.add(listener)
        return () => messages.delete(listener)
      },
      onClose: listener => {
        closes.add(listener)
        return () => closes.delete(listener)
      },
    }
  }

  it.each([
    ['breaks, a 500', 500, broken],
    ['refuses the caller, a 401', 401, explained],
  ])(
    'keeps its outbox and asks again while the resolver %s, and sends it once it answers',
    async (_, status, failing) => {
      let down = true
      const answered: Array<number> = []
      const host = hosting(() => (down ? failing() : Effect.succeed('ada')))
      const writer = await replica('a')
      await Effect.runPromise(writer.submit(Message.CreatedTodo({ id: 'a0', title: 'Milk' })))
      await Effect.runPromise(
        Effect.gen(function* () {
          const failed = yield* Effect.result(writer.synchronize)
          expect(Result.isFailure(failed)).toBe(true)
          const waiting = yield* writer.status
          // As for a server that is not there: nothing of the answer, and the edit kept.
          expect(waiting.lastError).toBe('transport closed')
          expect(waiting.pending).toBe(1)
          expect(answered.length).toBeGreaterThanOrEqual(2)
          expect(new Set(answered)).toEqual(new Set([status]))
          down = false
          // The transport goes on reconnecting on its backoff; the replica's next tries meet it.
          yield* writer.synchronize.pipe(
            Effect.retry({ schedule: Schedule.spaced('5 millis'), times: 400 }),
          )
          const sent = yield* writer.status
          expect(sent.pending).toBe(0)
          expect(sent.lastError).toBeUndefined()
        }).pipe(
          Effect.provide(
            Sync.transport.socket({
              makeSocket: () => dial(host, answered),
              retryBase: '1 millis',
              maxRetries: 1,
            }),
          ),
        ),
      )
    },
  )
})
