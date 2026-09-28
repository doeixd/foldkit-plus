import { DateTime } from 'effect'
import {
  Command,
  ManagedResource,
  Subscription,
  click,
  expect,
  given,
  placeholder,
  role,
  scene,
  text,
  type,
} from 'foldkit/scene'
import { modifyFields } from 'foldkit/struct'
import { WebSocketMessage } from 'foldkit-primitives/net'
import { describe, test } from 'vitest'

import {
  Message,
  type Model,
  TimestampReceivedMessage,
  TimestampSentMessage,
  init,
  managedResources,
  update,
  view,
} from '../src/main.js'
import { fromSocket, sendOnSocket } from './fixtures.js'

const idleModel: Model = init().model

/** The view's inputs the way the socket and the page's wanting leave them. */
const socket = (
  status: 'closed' | 'connecting' | 'open',
  lastError: string | null,
  opened: boolean,
  wantConnection: boolean,
) => ({
  wantConnection: () => wantConnection,
  chatSocket: (chat: Model['chatSocket']) => ({ ...chat, status, lastError, opened }),
})

const chatSocket = managedResources['ChatSocket@chatSocket/socket']!

const zonedAt = (timestamp: number) => DateTime.makeZonedUnsafe(timestamp, { timeZone: 'UTC' })

describe('view', () => {
  test('initial view shows the heading, status, and a Connect button', () => {
    scene(
      { update, view },
      given(idleModel),
      expect(text('WebSocket Chat')).toExist(),
      expect(text('Disconnected')).toExist(),
      expect(role('button', { name: 'Connect to Chat' })).toExist(),
      expect(text('No messages yet')).toExist(),
    )
  })

  test('connecting state renders the Connecting message', () => {
    scene(
      { update, view },
      given(modifyFields(idleModel, socket('connecting', null, false, true))),
      expect(text('Connecting...')).toExist(),
    )
  })

  test('connected state shows the message input and Send button', () => {
    scene(
      { update, view },
      given(modifyFields(idleModel, socket('open', null, true, true))),
      expect(placeholder('Type a message...')).toExist(),
      expect(role('button', { name: 'Send' })).toBeDisabled(),
      type(placeholder('Type a message...'), 'hi'),
      expect(role('button', { name: 'Send' })).toBeEnabled(),
    )
  })

  test('error state renders the error and a Try Again button', () => {
    scene(
      { update, view },
      given(modifyFields(idleModel, socket('closed', 'Connection refused', false, false))),
      expect(text('Connection Error')).toExist(),
      expect(text('Connection refused')).toExist(),
      expect(role('button', { name: 'Try Again' })).toExist(),
    )
  })

  test('messages render in the conversation list', () => {
    scene(
      { update, view },
      given(
        modifyFields(idleModel, {
          ...socket('open', null, true, true),
          messages: () => [
            { text: 'Hello there', zoned: zonedAt(0), isSent: true },
            { text: 'General Kenobi', zoned: zonedAt(0), isSent: false },
          ],
        }),
      ),
      expect(text('Hello there')).toExist(),
      expect(text('General Kenobi')).toExist(),
      expect(text('No messages yet')).toBeAbsent(),
    )
  })

  test('an acquired socket that opens connects the chat and the user can send a message', () => {
    scene(
      { update, view },
      given(idleModel),
      click(role('button', { name: 'Connect to Chat' })),
      expect(text('Connecting...')).toExist(),
      ManagedResource.acquire(chatSocket),
      expect(text('Connecting...')).toExist(),
      Subscription.emit(fromSocket(WebSocketMessage.Opened())),
      expect(placeholder('Type a message...')).toExist(),
      type(placeholder('Type a message...'), 'hi there'),
      click(role('button', { name: 'Send' })),
      Command.expectExact(sendOnSocket('hi there')),
      Command.resolve(sendOnSocket('hi there'), WebSocketMessage.Sent({ data: 'hi there' })),
      Command.expectExact(TimestampSentMessage({ text: 'hi there' })),
      Command.resolve(
        TimestampSentMessage,
        Message.TimestampedMessage({
          text: 'hi there',
          zoned: zonedAt(0),
          isSent: true,
        }),
      ),
      expect(text('hi there')).toExist(),
      expect(text('No messages yet')).toBeAbsent(),
    )
  })

  test.each([
    [
      'a socket that fails before opening',
      fromSocket(WebSocketMessage.Failed({ message: 'x' })),
      'Failed to connect to WebSocket',
    ],
    ['an attempt that times out', fromSocket(WebSocketMessage.TimedOut()), 'Connection timeout'],
  ])('%s shows the connection error', (_, failure, error) => {
    scene(
      { update, view },
      given(idleModel),
      click(role('button', { name: 'Connect to Chat' })),
      expect(text('Connecting...')).toExist(),
      ManagedResource.acquire(chatSocket),
      Subscription.emit(failure),
      expect(text('Connection Error')).toExist(),
      expect(text(error)).toExist(),
      expect(role('button', { name: 'Try Again' })).toExist(),
    )
  })

  test('a message arriving on the socket lands in the conversation', () => {
    scene(
      { update, view },
      given(modifyFields(idleModel, socket('open', null, true, true))),
      Subscription.emit(fromSocket(WebSocketMessage.Received({ data: 'hello from echo' }))),
      Command.expectExact(TimestampReceivedMessage({ text: 'hello from echo' })),
      Command.resolve(
        TimestampReceivedMessage,
        Message.TimestampedMessage({
          text: 'hello from echo',
          zoned: zonedAt(0),
          isSent: false,
        }),
      ),
      expect(text('hello from echo')).toExist(),
      expect(text('No messages yet')).toBeAbsent(),
    )
  })
})
