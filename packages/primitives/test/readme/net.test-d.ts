import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { Bundle } from 'foldkit-bundle'
import {
  Online,
  SharedHost,
  websocket,
  type ConversationHandler,
  type SocketService,
} from '../../src/net/index.js'

const Page = Bundle.compose({}).pipe(Bundle.withChild('net', Online))
type Model = typeof Page.Model.Type
type Message = typeof Page.Message.Type
const { placements } = Page

const config = placements.complete({
  init: () => placements.initial({}),
  update: placements.update(model => ({ model })),
  view: (model: Model, h: HtmlBuilder<Message>) =>
    h.div([], [model.net.online ? 'Online' : 'Offline']),
  subscriptions: placements.subscriptions(),
})
void config

const ChatSocket = websocket({ name: 'ChatSocket' })

const Chat = Bundle.compose({ wantConnection: Schema.Boolean }).pipe(
  Bundle.withServices<SocketService>(),
  Bundle.withChild('socket', ChatSocket, {
    args: { url: 'wss://example.com/chat', connectTimeoutMs: 5000 },
    when: model => model.wantConnection,
  }),
)
type ChatModel = typeof Chat.Model.Type
const send = (model: ChatModel) => Chat.children.socket.helpers.send('hi')(model)
void send

// SharedHost: one server for every tab.
const Opening = Schema.TaggedStruct('Notes', { device: Schema.String })
const Notes = SharedHost.define({ name: 'notes', opening: Opening })
declare const openHost: () => Promise<ConversationHandler<typeof Opening.Type>>
Notes.serve(openHost)
const host = Notes.connect({
  worker: () => new SharedWorker(new URL('./worker.ts', import.meta.url), { type: 'module' }),
  inPage: () => Promise.resolve({ openHost }).then(({ openHost }) => openHost()),
})
const port: MessagePort = host.open(Opening.make({ device: 'a' }))
void port
// @ts-expect-error -- an opening the host does not decode
host.open({ device: 'a' })
