// @vitest-environment node
/**
 * WebSocket: pure transitions, acquire/release against a real server,
 * server-to-queue duplex, and the send helper's service requirement.
 */
import { Effect, Fiber, Option, Queue, Ref, Schema, Stream } from 'effect'
import { TestClock } from 'effect/testing'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { WebSocket as WsClient, WebSocketServer } from 'ws'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  Socket,
  type SocketHandle,
  websocket,
  WebSocketMessage,
  type WebSocketModel,
} from '../src/net/index.js'
import { takeMessages } from './support.js'

const Chat = websocket({
  name: 'Chat',
  createSocket: url => new WsClient(url),
})
const Doc = Bundle.declare(Chat, 'chat')
const Model = Schema.Struct({ ...Doc.fields })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Doc.cases })
type Message = typeof Message.Type
const Page = Bundle.parent({ Model, Message })
const placed = Page.at(Doc, { args: { url: 'ws://localhost/chat' } })

const fold = (model: Model, message: Parameters<typeof Doc.wrapper.make>[0]) =>
  Option.getOrThrow(placed.update(model, Doc.wrapper.make(message))).model.chat
const fresh: Model = { chat: { url: 'ws://localhost/chat', status: 'closed', lastError: null } }

describe('WebSocket transitions', () => {
  it('connects, opens, receives without storing, and closes', () => {
    expect(placed.init({ chat: fresh.chat }).model.chat).toEqual(fresh.chat)
    const connecting = fold(fresh, WebSocketMessage.Connecting())
    expect(connecting).toEqual({ ...fresh.chat, status: 'connecting' })
    const open = fold({ chat: connecting }, WebSocketMessage.Opened())
    expect(open).toEqual({ ...fresh.chat, status: 'open', lastError: null })
    // Received notifies without storing: same Model, still observable.
    expect(fold({ chat: open }, WebSocketMessage.Received({ data: 'hi' }))).toEqual(open)
    expect(fold({ chat: open }, WebSocketMessage.Closed())).toEqual({
      ...fresh.chat,
      status: 'closed',
    })
    expect(fold(fresh, WebSocketMessage.Failed({ message: 'boom' }))).toEqual({
      ...fresh.chat,
      status: 'closed',
      lastError: 'boom',
    })
  })
})

describe('WebSocket against a server', () => {
  const servers: Array<WebSocketServer> = []
  afterEach(async () => {
    await Promise.all(
      servers.splice(0).map(
        server =>
          new Promise<void>((resolve, reject) => {
            server.close(error => {
              if (error instanceof Error) reject(error)
              else resolve()
            })
          }),
      ),
    )
  })

  const listen = async (onConnection?: (socket: WsClient) => void) => {
    const server = new WebSocketServer({ host: '127.0.0.1', port: 0 })
    servers.push(server)
    await new Promise<void>(resolve => {
      server.on('listening', () => resolve())
    })
    const address = server.address()
    if (typeof address !== 'object' || address === null) throw new Error('no address')
    if (onConnection !== undefined) server.on('connection', onConnection)
    return `ws://127.0.0.1:${address.port}/chat`
  }

  it('acquires, streams server messages, and releases', async () => {
    const url = await listen(socket => {
      socket.send('hello')
    })
    const entry = Chat.resources!({ url }).socket!
    const acquired = await Effect.runPromise(Effect.scoped(entry.acquire(url)))
    const events = await Effect.runPromise(
      takeMessages(Stream.fromQueue(acquired.events), 2, '5 seconds'),
    )
    expect(events).toEqual([
      WebSocketMessage.Opened(),
      WebSocketMessage.Received({ data: 'hello' }),
    ])
    await Effect.runPromise(entry.release(acquired))
    // The closing handshake is async: CLOSING now, CLOSED once acknowledged.
    await vi.waitFor(() => expect(acquired.socket.readyState).toBe(WsClient.CLOSED))
  })

  it('maps a refused connection to Failed and Closed', async () => {
    const doomed = new WebSocketServer({ host: '127.0.0.1', port: 0 })
    await new Promise<void>(resolve => {
      doomed.on('listening', () => resolve())
    })
    const address = doomed.address()
    if (typeof address !== 'object' || address === null) throw new Error('no address')
    const url = `ws://127.0.0.1:${address.port}/chat`
    await new Promise<void>((resolve, reject) => {
      doomed.close(error => {
        if (error instanceof Error) reject(error)
        else resolve()
      })
    })
    const entry = Chat.resources!({ url }).socket!
    const acquired = await Effect.runPromise(Effect.scoped(entry.acquire(url)))
    const events = await Effect.runPromise(
      takeMessages(Stream.fromQueue(acquired.events), 2, '5 seconds'),
    )
    expect(events[0]).toEqual(WebSocketMessage.Failed({ message: expect.any(String) }))
    expect(events[1]).toEqual(WebSocketMessage.Closed())
    await Effect.runPromise(entry.release(acquired))
  })

  it('builds a send command carrying its data', () => {
    const live = Page.at(Doc, { args: { url: 'ws://localhost/chat' } })
    const returned = live.helpers.send('hi')({
      chat: { url: 'ws://localhost/chat', status: 'open', lastError: null },
    })
    expect(returned.commands).toHaveLength(1)
    expect(returned.commands![0]!.name).toBe('WebSocket.send')
    expect(returned.commands![0]!.args).toEqual({ data: 'hi' })
  })
})

describe('WebSocket assembly', () => {
  it('refuses a second socket in one assembly', () => {
    const ChatA = Bundle.declare(Chat, 'chatA')
    const ChatB = Bundle.declare(Chat, 'chatB')
    const TwoModel = Schema.Struct({ ...ChatA.fields, ...ChatB.fields })
    type TwoModel = typeof TwoModel.Type
    const TwoMessage = defineMessageUnion({ ...ChatA.cases, ...ChatB.cases })
    const TwoPage = Bundle.parent({ Model: TwoModel, Message: TwoMessage })
    expect(() =>
      TwoPage.assemble(
        TwoPage.at(ChatA, { args: { url: 'ws://a/chat' } }),
        TwoPage.at(ChatB, { args: { url: 'ws://b/chat' } }),
      ),
    ).toThrow(/both use the Managed Resource "websocket"/)
  })
})

describe('WebSocket message decoding', () => {
  const fake = {
    readyState: 1,
    send: (_data: string) => undefined,
    close: () => undefined,
    onopen: null as ((event: any) => void) | null,
    onmessage: null as ((event: any) => void) | null,
    onclose: null as ((event: any) => void) | null,
    onerror: null as ((event: any) => void) | null,
  }
  const fire = (data: unknown) => {
    if (fake.onmessage === null) throw new Error('socket never attached')
    fake.onmessage({ data })
  }
  const Binary = websocket({ name: 'Binary', createSocket: () => fake })

  it('decodes string, Blob, and binary payloads as text', async () => {
    const entry = Binary.resources!({ url: 'ws://test/chat' }).socket!
    const acquired = await Effect.runPromise(Effect.scoped(entry.acquire('ws://test/chat')))
    fire('hi')
    fire(new Blob(['blob']))
    fire(new Uint8Array([104, 105]))
    const events = await Effect.runPromise(
      takeMessages(Stream.fromQueue(acquired.events), 3, '5 seconds'),
    )
    expect(events).toEqual([
      WebSocketMessage.Received({ data: 'hi' }),
      WebSocketMessage.Received({ data: 'blob' }),
      WebSocketMessage.Received({ data: 'hi' }),
    ])
    await Effect.runPromise(entry.release(acquired))
  })
})

describe('WebSocket on a stand-in socket: connect timeout and send', () => {
  const url = 'ws://test/chat'
  const socketIn = (readyState: number) => {
    const closes: Array<number> = []
    const socket: SocketHandle = {
      readyState,
      send: () => undefined,
      close: () => void closes.push(socket.readyState),
      onopen: () => undefined,
      onmessage: () => undefined,
      onclose: () => undefined,
      onerror: () => undefined,
    }
    return { socket, closes }
  }

  /**
   * What the timeout entry emits within `millis` of TestClock time for a
   * socket in `status`, with the resource holding `socket` (none: released).
   */
  const emittedWithin = (
    args: { readonly url: string; readonly connectTimeoutMs?: number },
    status: WebSocketModel['status'],
    socket: Option.Option<SocketHandle>,
    millis: number,
  ) =>
    Effect.runPromise(
      Effect.gen(function* () {
        const entry = Chat.subscriptions!(args).connectTimeout!
        const dependencies = entry.modelToDependencies({ url, status, lastError: null })
        const events = yield* Queue.unbounded<WebSocketMessage>()
        const emitted: Array<WebSocketMessage> = []
        const fiber = yield* Effect.forkChild(
          Stream.runForEach(
            entry.dependenciesToStream(dependencies, () => dependencies),
            message => Effect.sync(() => void emitted.push(message)),
          ).pipe(
            Effect.provideServiceEffect(
              Socket._tag,
              Ref.make(Option.map(socket, value => ({ socket: value, events }))),
            ),
          ),
        )
        for (let i = 0; i < 100; i++) yield* Effect.yieldNow
        yield* TestClock.adjust(millis)
        for (let i = 0; i < 100; i++) yield* Effect.yieldNow
        yield* Fiber.interrupt(fiber)
        return emitted
      }).pipe(Effect.provide(TestClock.layer())),
    )

  const timed = { url, connectTimeoutMs: 5000 }

  it('closes a socket still connecting when the time runs out, and reports TimedOut', async () => {
    const early = socketIn(0)
    expect(await emittedWithin(timed, 'connecting', Option.some(early.socket), 4999)).toEqual([])
    expect(early.closes).toEqual([])
    const late = socketIn(0)
    expect(await emittedWithin(timed, 'connecting', Option.some(late.socket), 5000)).toEqual([
      WebSocketMessage.TimedOut(),
    ])
    expect(late.closes).toEqual([0])
    // Detached before closing, so the close's own error and close events report nothing.
    expect([late.socket.onopen, late.socket.onerror, late.socket.onclose]).toEqual([
      null,
      null,
      null,
    ])
  })

  it('leaves a socket that opened before the timer alone', async () => {
    const opened = socketIn(1)
    expect(await emittedWithin(timed, 'connecting', Option.some(opened.socket), 60_000)).toEqual([])
    expect(opened.closes).toEqual([])
  })

  it.each([
    ['open', timed, 'open'],
    ['closed', timed, 'closed'],
    ['connecting with no timeout given', { url }, 'connecting'],
  ] as const)('never fires while %s', async (_, args, status) => {
    const { socket, closes } = socketIn(0)
    expect(await emittedWithin(args, status, Option.some(socket), 60_000)).toEqual([])
    expect(closes).toEqual([])
  })

  it('ends quietly when the socket was released while it waited', async () => {
    expect(await emittedWithin(timed, 'connecting', Option.none(), 60_000)).toEqual([])
  })

  it('reports a send with what it sent', async () => {
    const { socket } = socketIn(1)
    const sent: Array<string> = []
    const open: SocketHandle = { ...socket, send: data => void sent.push(data) }
    const [command] = placed.helpers.send('hi')({
      chat: { url, status: 'open', lastError: null },
    }).commands!
    const events = await Effect.runPromise(Queue.unbounded<WebSocketMessage>())
    const result = await Effect.runPromise(
      command!.effect.pipe(
        Effect.provideServiceEffect(Socket._tag, Ref.make(Option.some({ socket: open, events }))),
      ),
    )
    expect(sent).toEqual(['hi'])
    expect(result).toEqual(Doc.wrapper.make(WebSocketMessage.Sent({ data: 'hi' })))
  })

  it('records the timeout as a close with its reason', () => {
    const connecting: Model = { chat: { url, status: 'connecting', lastError: null } }
    const timedOut = fold(connecting, WebSocketMessage.TimedOut())
    expect(timedOut).toEqual({
      url,
      status: 'closed',
      lastError: `websocket connect to ${url} timed out`,
    })
    expect(fold({ chat: timedOut }, WebSocketMessage.TimedOut())).toBe(timedOut)
  })

  it('refuses a timeout that is not positive and finite at placement', () => {
    expect(() => Page.at(Doc, { args: { url, connectTimeoutMs: 0 } })).toThrow(/args do not match/)
    expect(() =>
      Page.at(Doc, { args: { url, connectTimeoutMs: Number.POSITIVE_INFINITY } }),
    ).toThrow(/args do not match/)
  })
})
