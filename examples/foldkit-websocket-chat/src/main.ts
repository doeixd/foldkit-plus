import * as UiButton from '@foldkit/ui/button'
import * as UiInput from '@foldkit/ui/input'
import { Array, DateTime, Effect, Match, Schema, String } from 'effect'
import { Command, type Runtime, Update } from 'foldkit'
import type { Document, Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { defineTaggedUnion } from 'foldkit/schema'
import { modifyFields } from 'foldkit/struct'
import { Bundle } from 'foldkit-bundle'
import { type NamedStyle, SlotView, Style, type SlotBuilders } from 'foldkit-mixins'
import { Button, type ButtonSlots, Input } from 'foldkit-mixins-ui'
import { type SocketService, WebSocketMessage, websocket } from 'foldkit-primitives/net'

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

export const ConnectionState = defineTaggedUnion({
  Disconnected: {},
  Connecting: {},
  Connected: {},
  Error: { error: Schema.String },
})
export type ConnectionState = typeof ConnectionState.Type

export const Model = Schema.Struct({
  ...ChatSocket.fields,
  connection: ConnectionState,
  messages: Schema.Array(ChatMessage),
  messageInput: Schema.String,
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

const moveTo =
  (connection: ConnectionState): UpdateStep =>
  model => ({ model: modifyFields(model, { connection: () => connection }) })

const unchanged: UpdateStep = model => ({ model })

/**
 * What the socket's report means for the page. The bundle keeps the socket's
 * own facts (`status`, `lastError`); the page decides what the reader sees,
 * in upstream's words, which depend on whether the socket had opened.
 */
const reactToSocket = (message: WebSocketMessage): UpdateStep =>
  WebSocketMessage.match(message, {
    Connecting: () => unchanged,
    Opened: () => model =>
      ConnectionState.match(model.connection, {
        Disconnected: () => ({ model }),
        Connecting: () => moveTo(ConnectionState.Connected())(model),
        Connected: () => ({ model }),
        Error: () => ({ model }),
      }),
    // Upstream listened only while connected; a frame queued behind a close is dropped.
    Received:
      ({ data }) =>
      model =>
        ConnectionState.match<UpdateReturn>(model.connection, {
          Disconnected: () => ({ model }),
          Connecting: () => ({ model }),
          Connected: () => ({ model, commands: [TimestampReceivedMessage({ text: data })] }),
          Error: () => ({ model }),
        }),
    // A close before the socket opened is left to the bundle's connect
    // timeout, as upstream's acquire was; the release that follows any other
    // close finds nothing to do.
    Closed: () => model =>
      ConnectionState.match(model.connection, {
        Disconnected: () => ({ model }),
        Connecting: () => ({ model }),
        Connected: () => ({
          model: modifyFields(model, {
            connection: () => ConnectionState.Disconnected(),
            messages: () => [],
          }),
        }),
        Error: () => ({ model }),
      }),
    Failed: () => model =>
      ConnectionState.match(model.connection, {
        Disconnected: () => ({ model }),
        Connecting: () =>
          moveTo(ConnectionState.Error({ error: 'Failed to connect to WebSocket' }))(model),
        Connected: () => moveTo(ConnectionState.Error({ error: 'Connection error' }))(model),
        Error: () => ({ model }),
      }),
    SendFailed: () => moveTo(ConnectionState.Error({ error: 'Socket unavailable' })),
    Sent:
      ({ data }) =>
      model => ({ model, commands: [TimestampSentMessage({ text: data })] }),
    TimedOut: () => model =>
      ConnectionState.match(model.connection, {
        Disconnected: () => ({ model }),
        Connecting: () => moveTo(ConnectionState.Error({ error: 'Connection timeout' }))(model),
        Connected: () => ({ model }),
        Error: () => ({ model }),
      }),
  })

// SOCKET

const Page = Bundle.parent({ Model, Message }).withServices<SocketService>()

/** The page wants a socket from Connect until it drops or fails, as upstream's resource did. */
const isConnectionWanted = ConnectionState.isAnyOf(['Connecting', 'Connected'])

const chatSocket = Page.at(ChatSocket, {
  args: { url: WS_URL, connectTimeoutMs: CONNECTION_TIMEOUT_MS },
  when: model => isConnectionWanted(model.connection),
  onMessage: reactToSocket,
})

const assembly = Page.assemble(chatSocket)

/** The page's own Messages: `GotChatSocketMessage` goes to the socket, then to `reactToSocket`. */
type OwnMessage = Bundle.OwnMessage<Message, typeof assembly.placements>

const updateOwn = (model: Model, message: OwnMessage): UpdateReturn =>
  Match.valueTags(message, {
    ClickedConnect: () => ({
      model: modifyFields(model, {
        connection: () => ConnectionState.Connecting(),
      }),
    }),

    UpdatedMessageInput: ({ value }) => ({
      model: modifyFields(model, {
        messageInput: () => value,
      }),
    }),

    SubmittedMessage: () => {
      const trimmedMessage = model.messageInput.trim()

      if (String.isEmpty(trimmedMessage)) {
        return { model }
      }

      return ConnectionState.match<UpdateReturn>(model.connection, {
        Disconnected: () => ({ model }),
        Connecting: () => ({ model }),
        Connected: () =>
          Update.combine(model, [
            next => ({ model: modifyFields(next, { messageInput: () => '' }) }),
            chatSocket.helpers.send(trimmedMessage),
          ]),
        Error: () => ({ model }),
      })
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
    connection: ConnectionState.Disconnected(),
    messages: [],
    messageInput: '',
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

// MANAGED RESOURCE

export const managedResources = assembly.resources()

// SUBSCRIPTION

export const subscriptions = assembly.subscriptions()

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
          connectionStatusView(model.connection, slots, h),
        ]),

        messagesView(model.messages, slots, h),

        ConnectionState.match(model.connection, {
          Disconnected: () => connectButtonView(slots, h),
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
  connection: ConnectionState,
  slots: Slots,
  h: HtmlBuilder<Message>,
): Html => {
  const state = h.DataAttribute(
    'state',
    ConnectionState.match(connection, {
      Disconnected: () => 'disconnected',
      Connecting: () => 'connecting',
      Connected: () => 'connected',
      Error: () => 'error',
    }),
  )

  return h.div(slots.status.attrs(), [
    h.div(slots.statusDot.attrs([state])),
    h.span(slots.statusLabel.attrs([state]), [
      ConnectionState.match(connection, {
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
  UiButton.view(
    {
      ...(config.onClick === undefined ? {} : { onClick: config.onClick }),
      ...(config.type === undefined ? {} : { type: config.type }),
      ...(config.isDisabled === undefined ? {} : { isDisabled: config.isDisabled }),
      toView: Button.toView([config.style.mixin], { h }, ({ button }) =>
        h.button(button, [config.label]),
      ),
    },
    h,
  )

const connectButtonView = (slots: Slots, h: HtmlBuilder<Message>): Html =>
  h.div(slots.footer.attrs(), [
    button(
      { label: 'Connect to Chat', style: ConnectButtonStyle, onClick: Message.ClickedConnect() },
      h,
    ),
  ])

const connectingView = (slots: Slots, h: HtmlBuilder<Message>): Html =>
  h.div(slots.footer.attrs(), [h.div(slots.connecting.attrs(), ['Connecting...'])])

const messageInputView = (messageInput: string, slots: Slots, h: HtmlBuilder<Message>): Html =>
  h.form(slots.composer.attrs([h.OnSubmit(Message.SubmittedMessage())]), [
    h.div(slots.composerRow.attrs(), [
      UiInput.view(
        {
          id: 'message',
          value: messageInput,
          placeholder: 'Type a message...',
          onInput: value => Message.UpdatedMessageInput({ value }),
          toView: Input.toView([MessageInputStyle.mixin], { h }, ({ input }) => h.input(input)),
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
