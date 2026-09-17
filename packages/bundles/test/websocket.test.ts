// @vitest-environment node
/**
 * WebSocket: pure transitions, acquire/release against a real server,
 * server-to-queue duplex, and the send helper's service requirement.
 */
import { Effect, Option, Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { WebSocket as WsClient, WebSocketServer } from 'ws'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { websocket, WebSocketMessage } from '../src/net/index.js'
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
