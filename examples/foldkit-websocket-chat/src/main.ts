import { Array, DateTime, Effect, Match, Schema, String } from 'effect'
import { Command, type Runtime, Update } from 'foldkit'
import type { Document, Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import { Bundle } from 'foldkit-bundle'
import { type NamedStyle, SlotView, Style, type SlotBuilders } from 'foldkit-mixins'
import { Button, type ButtonSlots, Input } from 'foldkit-mixins-ui'
import {
  type SocketService,
  SocketView,
  WebSocketMessage,
  isOpen,
  viewOf,
  websocket,
} from 'foldkit-primitives/net'

import {
  ChatPage,
  ConnectButtonStyle,
  MessageInputStyle,
  RetryButtonStyle,
  SendButtonStyle,
} from './style.js'

const WS_URL = 'wss://ws.postman-echo.com/raw'
/** How long an attempt may stay connecting, as upstream's acquire allowed. */
const CONNECTION_TIMEOUT_MS = 5000

const getZonedTime = DateTime.now.pipe(
  Effect.map(utc => DateTime.setZone(utc, DateTime.zoneMakeLocal())),
)

// MODEL

const ChatMessage = Schema.Struct({
  text: Schema.String,
  zoned: Schema.DateTimeZoned,
  isSent: Schema.Boolean,
})

type ChatMessage = typeof ChatMessage.Type

/** The socket, its frames decoded to text, as `foldkit-primitives`' WebSocket bundle. */
const ChatSocket = Bundle.declare(websocket({ name: 'ChatSocket' }), 'chatSocket')

export const Model = Schema.Struct({
  ...ChatSocket.fields,
  /** Whether the page wants its socket: set by a click, cleared by a close or a failure. */
  wantConnection: Schema.Boolean,
  messages: Schema.Array(ChatMessage),
  messageInput: Schema.String,
  /**
   * Whether a send was asked while the socket was shut. The draft is kept and
   * the footer says so; nothing is queued or sent on reconnect, so the author
   * reviews the draft and sends it themselves.
   */
  offlineSendKept: Schema.Boolean,
})

export type Model = typeof Model.Type

// MESSAGE

export const Message = defineMessageUnion({
  ...ChatSocket.cases,
  ClickedConnect: {},
  UpdatedMessageInput: { value: Schema.String },
  SubmittedMessage: {},
  TimestampedMessage: {
    text: Schema.String,
    zoned: Schema.DateTimeZoned,
    isSent: Schema.Boolean,
  },
})

export type Message = typeof Message.Type

// UPDATE

type UpdateReturn = Update.Return<Model, Message, SocketService>
type UpdateStep = Update.Step<Model, Message, SocketService>

const stopWanting: UpdateStep = model =>
  model.wantConnection ? { model: modifyFields(model, { wantConnection: () => false }) } : { model }

const unchanged: UpdateStep = model => ({ model })

/**
 * What the socket's report means for the page. The bundle keeps the socket's
 * state (`status`, `lastError`, `opened`) and words its errors; the view
 * derives from those. What stays here: stamping incoming frames, dropping
 * what was said on a clean close, and the wanting itself.
 */
const reactToSocket = (message: WebSocketMessage): UpdateStep =>
  WebSocketMessage.match(message, {
    Connecting: () => unchanged,
    Opened: () => unchanged,
    // Upstream listened only while connected; a frame queued behind a close is dropped.
    Received:
      ({ data }) =>
      model =>
        isOpen(model.chatSocket)
          ? { model, commands: [TimestampReceivedMessage({ text: data })] }
          : { model },
    Closed: () => model => {
      const socket = model.chatSocket
      // A close before the socket opened leaves the timeout to report it.
      if (socket.lastError === null && !socket.opened) return { model }
      if (socket.lastError !== null) return stopWanting(model)
      // A clean close after open: drop what was said.
      return {
        model: modifyFields(model, { wantConnection: () => false, messages: () => [] }),
      }
    },
    Failed: () => stopWanting,
    SendFailed: () => stopWanting,
    Sent:
      ({ data }) =>
      model => ({ model, commands: [TimestampSentMessage({ text: data })] }),
    TimedOut: () => stopWanting,
  })

// SOCKET

const Page = Bundle.parent({ Model, Message }).withServices<SocketService>()

const chatSocket = Page.at(ChatSocket, {
  args: { url: WS_URL, connectTimeoutMs: CONNECTION_TIMEOUT_MS },
  when: model => model.wantConnection,
  onMessage: reactToSocket,
})

export const assembly = Page.assemble(chatSocket)

/** The page's own Messages: `GotChatSocketMessage` goes to the socket, then to `reactToSocket`. */
type OwnMessage = Bundle.OwnMessage<Message, typeof assembly.placements>

const updateOwn = (model: Model, message: OwnMessage): UpdateReturn =>
  Match.valueTags(message, {
    ClickedConnect: () => ({
      model: modifyFields(model, {
        wantConnection: () => true,
      }),
    }),

    UpdatedMessageInput: ({ value }) => ({
      model: modifyFields(model, {
        messageInput: () => value,
        // New text supersedes the kept send: the notice stands for the draft as sent.
        offlineSendKept: () => false,
      }),
    }),

    SubmittedMessage: () => {
      const trimmedMessage = model.messageInput.trim()

      if (String.isEmpty(trimmedMessage)) {
        return { model }
      }

      return isOpen(model.chatSocket)
        ? Update.combine(model, [
            next => ({
              model: modifyFields(next, {
                messageInput: () => '',
                offlineSendKept: () => false,
              }),
            }),
            chatSocket.helpers.send(trimmedMessage),
          ])
        : // Offline sends are kept, not queued: the draft stays, and the
          // footer names what happened, until the author edits, connects, or
          // sends. An auto-send on reconnect would speak for them.
          {
            model: modifyFields(model, { offlineSendKept: () => true }),
          }
    },

    TimestampedMessage: ({ text, zoned, isSent }) => {
      const newMessage = ChatMessage.make({ text, zoned, isSent })

      return {
        model: modifyFields(model, {
          messages: messages => [...messages, newMessage],
        }),
      }
    },
  })

export const update = assembly.update(updateOwn)

// INIT

export const init: Runtime.ApplicationInit<Model, Message, void, never, SocketService> = () =>
  assembly.initial({
    wantConnection: false,
    messages: [],
    messageInput: '',
    offlineSendKept: false,
  })

// COMMAND

export const TimestampSentMessage = Command.define('TimestampSentMessage', {
  args: { text: Schema.String },
  messages: [Message.TimestampedMessage],
  execute: ({ text }) =>
    getZonedTime.pipe(
      Effect.map(zoned => Message.TimestampedMessage({ text, zoned, isSent: true })),
    ),
})

export const TimestampReceivedMessage = Command.define('TimestampReceivedMessage', {
  args: { text: Schema.String },
  messages: [Message.TimestampedMessage],
  execute: ({ text }) =>
    getZonedTime.pipe(
      Effect.map(zoned => Message.TimestampedMessage({ text, zoned, isSent: false })),
    ),
})

// VIEW

type Slots = SlotBuilders<typeof ChatPage.slots, Message>

export const Chat = SlotView.forMessages<Message>()
  .define(ChatPage.slots, (model: Model, slots, h) =>
    h.div(slots.page.attrs(), [
      h.div(slots.card.attrs(), [
        h.div(slots.header.attrs(), [
          h.div(slots.heading.attrs(), [
            h.div(slots.title.attrs(), ['WebSocket Chat']),
            h.div(slots.subtitle.attrs(), ['Echo server demo']),
          ]),
          connectionStatusView(viewOf(model.chatSocket, model.wantConnection), slots, h),
        ]),

        messagesView(model.messages, slots, h),

        SocketView.match(viewOf(model.chatSocket, model.wantConnection), {
          Disconnected: () => connectButtonView(model, slots, h),
          Connecting: () => connectingView(slots, h),
          Connected: () => messageInputView(model.messageInput, slots, h),
          Error: ({ error }) => errorView(error, slots, h),
        }),
      ]),
    ]),
  )
  .pipe(Style.attach(ChatPage.style))

export const view = (model: Model, h: HtmlBuilder<Message>): Document => ({
  title: 'WebSocket Chat',
  body: Chat(model, h),
})

const connectionStatusView = (
  connection: SocketView,
  slots: Slots,
  h: HtmlBuilder<Message>,
): Html => {
  const state = h.DataAttribute(
    'state',
    SocketView.match(connection, {
      Disconnected: () => 'disconnected',
      Connecting: () => 'connecting',
      Connected: () => 'connected',
      Error: () => 'error',
    }),
  )

  return h.div(slots.status.attrs(), [
    h.div(slots.statusDot.attrs([state])),
    h.span(slots.statusLabel.attrs([state]), [
      SocketView.match(connection, {
        Disconnected: () => 'Disconnected',
        Connecting: () => 'Connecting...',
        Connected: () => 'Connected',
        Error: () => 'Error',
      }),
    ]),
  ])
}

const messagesView = (
  messages: ReadonlyArray<ChatMessage>,
  slots: Slots,
  h: HtmlBuilder<Message>,
): Html =>
  Array.match(messages, {
    onEmpty: () =>
      h.div(slots.messages.attrs([h.DataAttribute('state', 'empty')]), [
        h.div(slots.empty.attrs(), [
          h.p(slots.emptyTitle.attrs(), ['No messages yet']),
          h.p(slots.emptyHint.attrs(), ['Send a message to get started!']),
        ]),
      ]),
    onNonEmpty: messages =>
      h.div(slots.messages.attrs(), [
        h.ul(
          slots.messageList.attrs(),
          messages.map(message => {
            const direction = h.DataAttribute('state', message.isSent ? 'sent' : 'received')

            return h.li(slots.messageRow.attrs([direction]), [
              h.div(slots.bubble.attrs([direction]), [
                h.p(slots.bubbleText.attrs(), [message.text]),
                h.p(slots.bubbleTime.attrs([direction]), [
                  DateTime.format(message.zoned, {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  }),
                ]),
              ]),
            ])
          }),
        ),
      ]),
  })

const button = (
  config: Readonly<{
    label: string
    style: NamedStyle<typeof ButtonSlots>
    onClick?: Message
    type?: 'submit'
    isDisabled?: boolean
  }>,
  h: HtmlBuilder<Message>,
): Html =>
  Button.view(
    {
      label: config.label,
      style: config.style,
      ...(config.type === undefined ? {} : { type: config.type }),
      ...(config.isDisabled === undefined ? {} : { disabled: config.isDisabled }),
      ...(config.onClick === undefined ? {} : { onClick: config.onClick }),
    },
    h,
  )

const connectButtonView = (model: Model, slots: Slots, h: HtmlBuilder<Message>): Html =>
  h.div(slots.footer.attrs(), [
    button(
      { label: 'Connect to Chat', style: ConnectButtonStyle, onClick: Message.ClickedConnect() },
      h,
    ),
    // A send asked while shut: the draft is kept, and this says so, until the
    // author edits, connects, or sends. Drawn on the footer's error text: it is
    // a send that did not go, not connection state (the header says that).
    ...(model.offlineSendKept && !String.isEmpty(model.messageInput.trim())
      ? [
          h.p(slots.errorText.attrs([h.Role('status')]), [
            'Not connected — your message is kept as a draft. Connect to send it.',
          ]),
        ]
      : []),
  ])

const connectingView = (slots: Slots, h: HtmlBuilder<Message>): Html =>
  h.div(slots.footer.attrs(), [h.div(slots.connecting.attrs(), ['Connecting...'])])

const messageInputView = (messageInput: string, slots: Slots, h: HtmlBuilder<Message>): Html =>
  h.form(slots.composer.attrs([h.OnSubmit(Message.SubmittedMessage())]), [
    h.div(slots.composerRow.attrs(), [
      Input.view(
        {
          id: 'message',
          value: messageInput,
          placeholder: 'Type a message...',
          onInput: value => Message.UpdatedMessageInput({ value }),
          style: MessageInputStyle,
          draw: ({ input }, h) => h.input(input),
        },
        h,
      ),
      button(
        {
          label: 'Send',
          style: SendButtonStyle,
          type: 'submit',
          isDisabled: String.isEmpty(messageInput.trim()),
        },
        h,
      ),
    ]),
  ])

const errorView = (error: string, slots: Slots, h: HtmlBuilder<Message>): Html =>
  h.div(slots.errorFooter.attrs(), [
    h.div(slots.errorBox.attrs(), [
      h.p(slots.errorTitle.attrs(), ['Connection Error']),
      h.p(slots.errorText.attrs(), [error]),
    ]),
    button({ label: 'Try Again', style: RetryButtonStyle, onClick: Message.ClickedConnect() }, h),
  ])

// RUNTIME

/**
 * The runtime the page boots on, assembled once: `assembly.runtime` compiles
 * `initial` to `init` and merges the socket's Subscriptions and Managed
 * Resources with the page's own (none), checking that each came from the
 * assembly. `entry.ts` and the runtime test both boot from this.
 */
export const runtimeConfig = (container: HTMLElement | null) =>
  assembly.runtime({
    initial: init,
    update,
    Model,
    view,
    container,
    devTools: { Message },
  })
