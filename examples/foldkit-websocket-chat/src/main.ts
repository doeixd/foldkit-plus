import * as UiButton from '@foldkit/ui/button'
import * as UiInput from '@foldkit/ui/input'
import { Array, DateTime, Duration, Effect, Option, Schema, Stream, String } from 'effect'
import { Command, type Runtime, Subscription, Update } from 'foldkit'
import type { Document, Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { defineTaggedUnion } from 'foldkit/schema'
import { modifyFields } from 'foldkit/struct'
import { Bundle } from 'foldkit-bundle'
import { type NamedStyle, SlotView, Style, type SlotBuilders } from 'foldkit-mixins'
import { Button, type ButtonSlots, Input } from 'foldkit-mixins-ui'
import { type SocketService, WebSocketMessage, websocket } from 'foldkit-primitives/net'

import {
  ChatSlots,
  ChatStyle,
  ConnectButtonStyle,
  MessageInputStyle,
  RetryButtonStyle,
  SendButtonStyle,
} from './style.js'

const WS_URL = 'wss://ws.postman-echo.com/raw'
const CONNECTION_TIMEOUT = Duration.millis(5000)

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
  FailedConnect: { error: Schema.String },
  UpdatedMessageInput: { value: Schema.String },
  SubmittedMessage: {},
  TimestampedMessage: {
    text: Schema.String,
    zoned: Schema.DateTimeZoned,
    isSent: Schema.Boolean,
  },
})

export type Message = typeof Message.Type

// SOCKET

const Page = Bundle.parent({ Model, Message })

/** The page wants a socket from Connect until it drops or fails, as upstream's resource did. */
const isConnectionWanted = ConnectionState.isAnyOf(['Connecting', 'Connected'])

const chatSocket = Page.at(ChatSocket, {
  args: { url: WS_URL },
  when: model => isConnectionWanted(model.connection),
})

const assembly = Page.assemble(chatSocket)

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
    // A close before the socket opened is left to the timeout, as upstream's
    // acquire was; the release that follows any other close finds nothing to do.
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
    Sent: () => unchanged,
  })

/** The placement claims its own wrapper, so its fold always applies. */
const foldChatSocket =
  (message: WebSocketMessage): UpdateStep =>
  model =>
    Option.getOrThrow(chatSocket.update(model, ChatSocket.wrapper.make(message)))

export const update = (model: Model, message: Message) =>
  Message.match<UpdateReturn>(message, {
    GotChatSocketMessage: ({ message }) =>
      Update.combine(model, [foldChatSocket(message), reactToSocket(message)]),

    ClickedConnect: () => ({
      model: modifyFields(model, {
        connection: () => ConnectionState.Connecting(),
      }),
    }),

    FailedConnect: ({ error }) => ({
      model: modifyFields(model, {
        connection: () => ConnectionState.Error({ error }),
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
            next => ({ model: next, commands: [TimestampSentMessage({ text: trimmedMessage })] }),
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

/**
 * Upstream's acquire gave up after five seconds; the socket bundle waits for
 * as long as the browser does, so the page times the attempt itself. The
 * stream restarts with each new attempt and stops when the attempt settles.
 */
export const pageSubscriptions = Subscription.make<Model, Message>()(entry => ({
  connectionTimeout: entry(
    { isConnecting: Schema.Boolean },
    {
      modelToDependencies: model => ({
        isConnecting: ConnectionState.guards.Connecting(model.connection),
      }),
      dependenciesToStream: ({ isConnecting }) =>
        isConnecting
          ? Stream.fromEffect(
              Effect.as(
                Effect.sleep(CONNECTION_TIMEOUT),
                Message.FailedConnect({ error: 'Connection timeout' }),
              ),
            )
          : Stream.empty,
    },
  ),
}))

export const subscriptions = assembly.subscriptions(pageSubscriptions)

// VIEW

type Slots = SlotBuilders<typeof ChatSlots, Message>

export const Chat = SlotView.forMessages<Message>()
  .define(ChatSlots, (model: Model, slots, h) =>
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
  .pipe(Style.attach(ChatStyle))

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
      toView: attributes =>
        h.button(
          Button.resolve<undefined, Message>(attributes, [config.style.mixin], {
            input: undefined,
            h,
          }).button,
          [config.label],
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
          toView: attributes =>
            h.input(
              Input.resolve<undefined, Message>(attributes, [MessageInputStyle.mixin], {
                input: undefined,
                h,
              }).input,
            ),
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
