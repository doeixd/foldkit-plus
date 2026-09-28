import { DateTime } from 'effect'
import { Command, given, message, model, story } from 'foldkit/story'
import { modifyFields } from 'foldkit/struct'
import { WebSocketMessage } from 'foldkit-primitives/net'
import { describe, expect, test } from 'vitest'

import {
  ConnectionState,
  Message,
  type Model,
  TimestampReceivedMessage,
  TimestampSentMessage,
  init,
  update,
} from '../src/main.js'
import { fromSocket, sendOnSocket } from './fixtures.js'

const idleModel: Model = init().model

const connectedModel: Model = modifyFields(idleModel, {
  connection: () => ConnectionState.Connected(),
})

const zonedNow = DateTime.makeZonedUnsafe(0, { timeZone: 'UTC' })

describe('update', () => {
  describe('connection state', () => {
    test('ClickedConnect moves into Connecting', () => {
      story(
        update,
        given(idleModel),
        message(Message.ClickedConnect()),
        model(model => {
          expect(model.connection._tag).toBe('Connecting')
        }),
      )
    })

    test('an opened socket moves into Connected', () => {
      story(
        update,
        given(
          modifyFields(idleModel, {
            connection: () => ConnectionState.Connecting(),
          }),
        ),
        message(fromSocket(WebSocketMessage.Opened())),
        model(model => {
          expect(model.connection._tag).toBe('Connected')
        }),
      )
    })

    test('a closed socket returns to Disconnected and clears messages', () => {
      story(
        update,
        given(
          modifyFields(connectedModel, {
            messages: () => [{ text: 'old', zoned: zonedNow, isSent: true }],
          }),
        ),
        message(fromSocket(WebSocketMessage.Closed())),
        model(model => {
          expect(model.connection._tag).toBe('Disconnected')
          expect(model.messages).toHaveLength(0)
        }),
      )
    })

    test('an attempt the socket gave up on reads "Connection timeout"', () => {
      story(
        update,
        given(
          modifyFields(idleModel, {
            connection: () => ConnectionState.Connecting(),
          }),
        ),
        message(fromSocket(WebSocketMessage.TimedOut())),
        model(model => {
          expect(model.connection).toEqual(ConnectionState.Error({ error: 'Connection timeout' }))
        }),
      )
    })
  })

  describe('message input', () => {
    test('UpdatedMessageInput stores the new input value', () => {
      story(
        update,
        given(connectedModel),
        message(Message.UpdatedMessageInput({ value: 'Hello' })),
        model(model => {
          expect(model.messageInput).toBe('Hello')
        }),
      )
    })
  })

  describe('SubmittedMessage', () => {
    test('an empty input is ignored', () => {
      story(
        update,
        given(modifyFields(connectedModel, { messageInput: () => '' })),
        message(Message.SubmittedMessage()),
        Command.expectNone(),
      )
    })

    test('whitespace-only input is ignored', () => {
      story(
        update,
        given(modifyFields(connectedModel, { messageInput: () => '   ' })),
        message(Message.SubmittedMessage()),
        Command.expectNone(),
      )
    })

    test('connected client sends on the socket and clears the input', () => {
      story(
        update,
        given(modifyFields(connectedModel, { messageInput: () => 'Hello there' })),
        message(Message.SubmittedMessage()),
        model(model => {
          expect(model.messageInput).toBe('')
        }),
        Command.expectExact(sendOnSocket('Hello there')),
        // The text is timestamped once the socket says it was sent.
        Command.resolve(
          sendOnSocket('Hello there'),
          WebSocketMessage.Sent({ data: 'Hello there' }),
        ),
        Command.expectExact(TimestampSentMessage({ text: 'Hello there' })),
        Command.resolve(
          TimestampSentMessage,
          Message.TimestampedMessage({
            text: 'Hello there',
            zoned: zonedNow,
            isSent: true,
          }),
        ),
        model(model => {
          expect(model.messages).toHaveLength(1)
          expect(model.messages[0]?.text).toBe('Hello there')
          expect(model.messages[0]?.isSent).toBe(true)
        }),
      )
    })

    test('a send the socket refused shows the socket as unavailable', () => {
      story(
        update,
        given(connectedModel),
        message(fromSocket(WebSocketMessage.SendFailed({ message: 'not open' }))),
        model(model => {
          expect(model.connection).toEqual(ConnectionState.Error({ error: 'Socket unavailable' }))
        }),
      )
    })

    test('disconnected client ignores SubmittedMessage', () => {
      story(
        update,
        given(modifyFields(idleModel, { messageInput: () => 'Hello' })),
        message(Message.SubmittedMessage()),
        Command.expectNone(),
        model(model => {
          expect(model.messageInput).toBe('Hello')
        }),
      )
    })
  })

  describe('inbound messages', () => {
    test('a received frame queues TimestampReceivedMessage that appends to the list', () => {
      story(
        update,
        given(connectedModel),
        message(fromSocket(WebSocketMessage.Received({ data: 'echo' }))),
        Command.expectHas(TimestampReceivedMessage),
        Command.resolve(
          TimestampReceivedMessage,
          Message.TimestampedMessage({
            text: 'echo',
            zoned: zonedNow,
            isSent: false,
          }),
        ),
        model(model => {
          expect(model.messages).toHaveLength(1)
          expect(model.messages[0]?.isSent).toBe(false)
          expect(model.messages[0]?.text).toBe('echo')
        }),
      )
    })

    test('a frame that arrives after the socket closed is dropped', () => {
      story(
        update,
        given(idleModel),
        message(fromSocket(WebSocketMessage.Received({ data: 'late' }))),
        Command.expectNone(),
      )
    })
  })
})
