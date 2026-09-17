// @vitest-environment jsdom
/**
 * A WebSocket on the real Foldkit runtime: mounting connects, a send reaches
 * the server, a dropped server reads back as closed, and sending while
 * closed reports SendFailed instead of throwing.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import type * as Update from 'foldkit/update'
import { Bundle } from 'foldkit-bundle'
import { WebSocket as WsClient, WebSocketServer } from 'ws'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { websocket, type SocketService } from '../src/net/index.js'

const Chat = websocket({
  name: 'Chat',
  createSocket: url => new WsClient(url),
})
const Doc = Bundle.declare(Chat, 'chat')
const Model = Schema.Struct({ ...Doc.fields })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Doc.cases, SendClicked: {} })
type Message = typeof Message.Type
const Page = Bundle.parent({ Model, Message }).withServices<SocketService>()

const view = (model: Model, h: HtmlBuilder<Message>) =>
  h.main(
    [],
    [
      h.div([h.Id('status')], [model.chat.status]),
      h.div([h.Id('error')], [model.chat.lastError ?? '']),
      h.button([h.Id('send'), h.OnClick(Message.SendClicked())], ['send']),
    ],
  )

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('WebSocket on the runtime', () => {
  it('connects, sends, survives a server drop, and reports a send with no connection', async () => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      setTimeout(() => callback(performance.now()), 0),
    )
    vi.stubGlobal('cancelAnimationFrame', clearTimeout)

    const received: Array<string> = []
    const server = new WebSocketServer({ host: '127.0.0.1', port: 0 })
    try {
      await new Promise<void>(resolve => {
        server.on('listening', () => resolve())
      })
      const address = server.address()
      if (typeof address !== 'object' || address === null) throw new Error('no address')
      const url = `ws://127.0.0.1:${address.port}/chat`
      server.on('connection', socket => {
        socket.on('message', data => {
          received.push(String(data))
        })
      })

      const container = document.createElement('div')
      container.id = 'websocket-runtime'
      document.body.appendChild(container)
      const chat = Page.at(Doc, { args: { url } })
      const assembly = Page.assemble(chat)
      const rest = assembly.update(model => ({ model }))
      const update = (
        model: Model,
        message: Message,
      ): Update.Return<Model, Message, SocketService> =>
        message._tag === 'SendClicked' ? chat.helpers.send('hi')(model) : rest(model, message)
      const handle = Runtime.embed(
        Runtime.makeElement(
          assembly.complete({
            Model,
            container,
            init: () =>
              assembly.initial({
                chat: { url, status: 'closed', lastError: null },
              }),
            update,
            view,
            subscriptions: assembly.subscriptions(),
            managedResources: assembly.resources(),
          }),
        ),
      )
      try {
        const text = (id: string) => document.querySelector(id)?.textContent
        const clickSend = () => (document.querySelector('#send') as HTMLElement).click()

        await vi.waitFor(() => expect(text('#status')).toBe('open'))
        clickSend()
        await vi.waitFor(() => expect(received).toEqual(['hi']))

        for (const socket of [...server.clients]) socket.close()
        await vi.waitFor(() => expect(text('#status')).toBe('closed'))
        clickSend()
        await vi.waitFor(() => expect(text('#error')).not.toBe(''))
      } finally {
        await handle.dispose()
        container.remove()
      }
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close(error => {
          if (error instanceof Error) reject(error)
          else resolve()
        })
      })
    }
  })
})
