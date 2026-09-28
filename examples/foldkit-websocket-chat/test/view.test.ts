import { DateTime } from 'effect'
import { modifyFields } from 'foldkit/struct'
import { Style } from 'foldkit-mixins'
import { Inert, type Node as InertNode } from 'foldkit-mixins/testing'
import { describe, expect, test } from 'vitest'

import { Chat, ConnectionState, type Model, init } from '../src/main.js'
import { stylesheet } from '../src/style.js'

const idleModel: Model = init().model
const zoned = DateTime.makeZonedUnsafe(0, { timeZone: 'UTC' })

const models: ReadonlyArray<readonly [string, Model]> = [
  ['disconnected', idleModel],
  ['connecting', modifyFields(idleModel, { connection: () => ConnectionState.Connecting() })],
  [
    'connected with messages',
    modifyFields(idleModel, {
      connection: () => ConnectionState.Connected(),
      messageInput: () => 'draft',
      messages: () => [
        { text: 'Hello there', zoned, isSent: true },
        { text: 'General Kenobi', zoned, isSent: false },
      ],
    }),
  ],
  [
    'failed',
    modifyFields(idleModel, {
      connection: () => ConnectionState.Error({ error: 'Connection error' }),
    }),
  ],
]

/** The compiled CSS behind the classes on `nodes`. */
const cssOf = (nodes: ReadonlyArray<InertNode>): string =>
  Style.usedIn(nodes.flatMap(Inert.classes).join(' '))

describe('the chat view', () => {
  test.each(models)('draws every element through a Slot when %s', (_, model) => {
    expect(Inert.unslotted(Inert.draw(Chat, model))).toEqual([])
  })

  test('ships every theme token the drawn styles read in the stylesheet', () => {
    // A token read without a fallback renders nothing when the sheet lacks it.
    const read = new Set(
      models.flatMap(([, model]) =>
        [...cssOf(Inert.all(Inert.draw(Chat, model))).matchAll(/var\((--fk-[\w-]+)\)/g)].map(
          ([, name]) => name,
        ),
      ),
    )
    expect(read.size).toBeGreaterThan(0)
    expect([...read].filter(name => !stylesheet.includes(`${name}:`))).toEqual([])
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
    expect(cssOf(Inert.bySlot(tree, 'messageRow'))).toContain(
      '[data-state="sent"]{justify-content:flex-end}',
    )
  })
})
