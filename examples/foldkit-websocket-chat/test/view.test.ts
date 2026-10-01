import { DateTime } from 'effect'
import { modifyFields } from 'foldkit/struct'
import { Inert } from 'foldkit-mixins/testing'
import { describe, expect, test } from 'vitest'

import { Chat, type Model, init } from '../src/main.js'
import { stylesheet } from '../src/style.js'

const idleModel: Model = init().model
const zoned = DateTime.makeZonedUnsafe(0, { timeZone: 'UTC' })

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

const models: ReadonlyArray<readonly [string, Model]> = [
  ['disconnected', idleModel],
  ['connecting', modifyFields(idleModel, socket('connecting', null, false, true))],
  [
    'connected with messages',
    modifyFields(idleModel, {
      ...socket('open', null, true, true),
      messageInput: () => 'draft',
      messages: () => [
        { text: 'Hello there', zoned, isSent: true },
        { text: 'General Kenobi', zoned, isSent: false },
      ],
    }),
  ],
  ['failed', modifyFields(idleModel, socket('closed', 'Connection error', true, false))],
]

describe('the chat view', () => {
  test.each(models)('draws every element through a Slot when %s', (_, model) => {
    expect(Inert.unslotted(Inert.draw(Chat, model))).toEqual([])
  })

  test.each(models)('ships every theme token the drawn styles read when %s', (_, model) => {
    const tree = Inert.draw(Chat, model)
    expect(Inert.css(Inert.all(tree))).toContain('var(--fk-')
    expect(Inert.missingTokens(tree, stylesheet)).toEqual([])
  })

  test.each([
    ['disconnected', idleModel, 'disconnected'],
    ['connecting', models[1]![1], 'connecting'],
    ['connected', models[2]![1], 'connected'],
    ['failed', models[3]![1], 'error'],
  ])('marks the status dot %s', (_, model, state) => {
    const [dot] = Inert.bySlot(Inert.draw(Chat, model), 'statusDot')
    expect(Inert.value(dot, 'data-state')).toBe(state)
  })

  test('marks each bubble by who sent it, so sent ones sit on the right', () => {
    const tree = Inert.draw(Chat, models[2]![1])
    expect(Inert.bySlot(tree, 'messageRow').map(row => Inert.value(row, 'data-state'))).toEqual([
      'sent',
      'received',
    ])
    expect(Inert.css(Inert.bySlot(tree, 'messageRow'))).toContain(
      '[data-state="sent"]{justify-content:flex-end}',
    )
  })
})
