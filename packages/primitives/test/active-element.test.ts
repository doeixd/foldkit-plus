// @vitest-environment jsdom
/**
 * Active-element entry: starts with the current answer, then follows focus.
 */
import { Effect, Fiber } from 'effect'
import { describe, expect, it } from 'vitest'
import { ActiveElementMessage, activeElementEvents } from '../src/events/index.js'
import { takeMessages } from './support.js'

describe('activeElementEvents', () => {
  it('starts with the body, then follows focus and blur', async () => {
    document.body.innerHTML = '<input id="name" /><button id="go">go</button>'
    const values = await Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(takeMessages(activeElementEvents(), 3))
        for (let i = 0; i < 100; i++) {
          yield* Effect.yieldNow
        }
        const input = document.getElementById('name') as HTMLElement
        input.focus()
        for (let i = 0; i < 10; i++) {
          yield* Effect.yieldNow
        }
        input.blur()
        return yield* Fiber.join(fiber)
      }),
    )
    expect(values).toEqual([
      ActiveElementMessage.Changed({ tag: 'BODY', id: null }),
      ActiveElementMessage.Changed({ tag: 'INPUT', id: 'name' }),
      ActiveElementMessage.Changed({ tag: 'BODY', id: null }),
    ])
    document.body.innerHTML = ''
  })
})
