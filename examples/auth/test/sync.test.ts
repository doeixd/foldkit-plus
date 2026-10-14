// @vitest-environment node
/**
 * The board's socket, served on Node through `documentHost` with the session
 * cookie: asked whom it serves before it opens, refused for a visitor or a
 * request from elsewhere, and closed once the session it opened with ends.
 */
import { Effect } from 'effect'
import { Sync, replicaId, type SocketLike, type Storage } from 'foldkit-sync'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'
import { BoardMessage, PinBoard } from '../src/domain.js'
import { startHttpServer } from '../src/http.js'
import { PAGE_ORIGIN, signIn, signOut } from './accounts.js'

let server: Awaited<ReturnType<typeof startHttpServer>>
beforeAll(async () => {
  server = await startHttpServer(0, PAGE_ORIGIN)
})
afterAll(() => server.close())

/** A socket to the board, as a browser opens one: its Origin and cookie, no header of the page's. */
const open = (headers: Record<string, string>) =>
  new WebSocket(`${server.url.replace('http', 'ws')}/sync`, { headers })

/** What the journal's exchange answers a connection `opens` refused. */
const REFUSED = 'This connection may not open the document'

const fromThePage = (cookie?: string) => ({
  origin: PAGE_ORIGIN,
  ...(cookie === undefined ? {} : { cookie }),
})

/** The status an upgrade was refused with, or `101` when the socket opened. */
const statusOf = (socket: WebSocket) =>
  new Promise<number>(resolve => {
    socket.once('open', () => {
      socket.close()
      resolve(101)
    })
    socket.once('unexpected-response', (_, response) => resolve(response.statusCode ?? 0))
  })

/** How the server closed a socket. */
const closeOf = (socket: WebSocket) =>
  new Promise<{ readonly code: number; readonly reason: string }>(resolve =>
    socket.once('close', (code, reason) => resolve({ code, reason: String(reason) })),
  )

const socketLike = (socket: WebSocket): SocketLike => ({
  send: data => socket.send(data),
  close: () => socket.close(),
  onMessage: listener => {
    const handler = (data: unknown): void => listener(String(data))
    socket.on('message', handler)
    return () => socket.off('message', handler)
  },
  onClose: listener => {
    socket.on('close', listener)
    return () => socket.off('close', listener)
  },
  onOpen: listener => {
    if (socket.readyState === WebSocket.OPEN) listener()
    else socket.once('open', listener)
    return () => socket.off('open', listener)
  },
})

const memory = (): Storage => {
  let state: unknown
  return {
    load: () => Effect.sync(() => state),
    save: next =>
      Effect.sync(() => {
        state = structuredClone(next)
      }),
    close: Effect.void,
  }
}

/** A replica that exchanges once over a socket opened with `cookie`. */
const exchangeAs = async (
  name: string,
  cookie: string | undefined,
  messages: ReadonlyArray<BoardMessage>,
) => {
  const replica = await Effect.runPromise(PinBoard.openReplica(replicaId(name), memory()))
  for (const message of messages) await Effect.runPromise(replica.submit(message))
  await Effect.runPromise(
    replica.synchronize.pipe(
      Effect.provide(
        Sync.transport.socket({ makeSocket: () => socketLike(open(fromThePage(cookie))) }),
      ),
    ),
  )
  return (await Effect.runPromise(replica.committed)).pins
}

describe('the board socket, by who the cookie says', () => {
  it('opens a visitor’s socket on a document it may not open: every exchange is refused', async () => {
    // A visitor is not a refusal of who is asking: the socket opens, as Remote answers one.
    expect(await statusOf(open(fromThePage()))).toBe(101)
    await expect(
      exchangeAs('visitor-tab', undefined, [BoardMessage.Pinned({ id: 'v1', text: 'Anyone?' })]),
    ).rejects.toThrow(REFUSED)
  })

  it('answers an upgrade anywhere but the board by closing the connection', async () => {
    const elsewhere = new WebSocket(`${server.url.replace('http', 'ws')}/remote`, {
      headers: fromThePage(await signIn(server.url, 'ada')),
    })
    expect(
      await new Promise(resolve => {
        elsewhere.once('open', () => resolve('opened'))
        elsewhere.once('error', () => resolve('closed'))
      }),
    ).toBe('closed')
  })

  it('refuses a cookie from a page elsewhere with a 401, opening nothing', async () => {
    const cookie = await signIn(server.url, 'ada')
    expect(await statusOf(open({ origin: 'https://elsewhere.example', cookie }))).toBe(401)
  })

  it('refuses a cookie the server no longer holds with a 401', async () => {
    const cookie = await signIn(server.url, 'ada')
    await signOut(server.url, cookie)
    expect(await statusOf(open(fromThePage(cookie)))).toBe(401)
  })

  it("orders one reader's pins for another", async () => {
    const ada = await signIn(server.url, 'ada')
    expect(
      await exchangeAs('ada-tab', ada, [BoardMessage.Pinned({ id: 'p1', text: 'Tea at four' })]),
    ).toEqual([{ id: 'p1', text: 'Tea at four' }])
    const grace = await signIn(server.url, 'grace')
    expect(await exchangeAs('grace-tab', grace, [])).toEqual([{ id: 'p1', text: 'Tea at four' }])
  })

  it('closes an open socket once its session ends, within one revalidation', async () => {
    const cookie = await signIn(server.url, 'grace')
    const socket = open(fromThePage(cookie))
    expect(await new Promise(resolve => socket.once('open', () => resolve(true)))).toBe(true)
    const closed = closeOf(socket)
    await signOut(server.url, cookie)
    expect(await closed).toEqual({ code: 4401, reason: 'Your session ended.' })
  })
})
