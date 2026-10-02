import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { Bundle } from 'foldkit-bundle'
import { Online, websocket, type SocketService } from '../../src/net/index.js'

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
