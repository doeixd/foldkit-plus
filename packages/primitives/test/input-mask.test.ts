// @vitest-environment jsdom
/**
 * Input mask: the pure mask language over a table, and the Mount wiring it
 * to a field (rewrite, caret, Input messages, teardown, non-field silence).
 */
import { Effect, Fiber } from 'effect'
import * as Mount from 'foldkit/mount'
import { describe, expect, it } from 'vitest'
import { Input, InputMask, applyMask } from '../src/dom/index.js'
import { takeMessages } from './support.js'

describe('applyMask', () => {
  const cases: ReadonlyArray<{
    readonly value: string
    readonly pattern: string
    readonly masked: string
    readonly raw: string
  }> = [
    { value: '1234567890', pattern: '(###) ###-####', masked: '(123) 456-7890', raw: '1234567890' },
    { value: '12', pattern: '(###) ###-####', masked: '(12', raw: '12' },
    { value: '', pattern: '(###) ###-####', masked: '', raw: '' },
    { value: 'abc', pattern: '###', masked: '', raw: '' },
    { value: '1a2b3', pattern: '###', masked: '123', raw: '123' },
    { value: '12345', pattern: '##', masked: '12', raw: '12' },
    { value: 'ABcd', pattern: 'AA-AA', masked: 'AB-cd', raw: 'ABcd' },
    { value: 'A1', pattern: '**', masked: 'A1', raw: 'A1' },
    { value: '1', pattern: 'A#', masked: '', raw: '' },
  ]
  for (const { value, pattern, masked, raw } of cases) {
    it(`masks ${JSON.stringify(value)} against ${JSON.stringify(pattern)}`, () => {
      expect(applyMask(value, pattern)).toEqual({ masked, raw })
    })
  }
})

describe('InputMask', () => {
  it('rewrites the field and emits masked and raw values', async () => {
    const input = document.createElement('input')
    document.body.appendChild(input)
    try {
      const values = await Effect.runPromise(
        Effect.gen(function* () {
          const fiber = yield* Effect.forkChild(
            takeMessages(
              InputMask({ pattern: '(###) ###-####' }).f(input, Mount.liveViewStateChanges),
              2,
            ),
          )
          for (let i = 0; i < 100; i++) {
            yield* Effect.yieldNow
          }
          input.value = '1234567890'
          input.dispatchEvent(new window.Event('input', { bubbles: true }))
          for (let i = 0; i < 10; i++) {
            yield* Effect.yieldNow
          }
          input.value = '12'
          input.dispatchEvent(new window.Event('input', { bubbles: true }))
          return yield* Fiber.join(fiber)
        }),
      )
      expect(values).toEqual([
        Input.make({ value: '(123) 456-7890', raw: '1234567890' }),
        Input.make({ value: '(12', raw: '12' }),
      ])
      expect(input.value).toBe('(12')
    } finally {
      input.remove()
    }
  })

  it('emits nothing on a non-field element', async () => {
    await expect(
      Effect.runPromise(
        takeMessages(
          InputMask({ pattern: '###' }).f(
            document.createElement('div'),
            Mount.liveViewStateChanges,
          ),
          1,
          '100 millis',
        ),
      ),
    ).rejects.toThrow(/stalled/)
  })
})
