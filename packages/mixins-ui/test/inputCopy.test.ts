/**
 * InputCopy: a read-only field its label names, a button that says what it
 * copies and sends `onCopy`, "Copied" on the button and in a status region
 * that is drawn before it speaks; and `Copy`, which reports the clipboard's
 * answer as a Message, a refusal included.
 */
import { Effect, Fiber } from 'effect'
import { TestClock } from 'effect/testing'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { A11y, Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { ClipboardMessage } from 'foldkit-primitives/dom'
import { InputCopy, InputCopySlots, Patterns, Recipes } from '../src/index.js'
import { h, message } from './fixture.js'

const style = Style.forSlots(InputCopySlots)(Recipes.InputCopy({}))
const drawn = (copied: boolean) =>
  InputCopy.view(
    { id: 'key', label: 'API key', value: 'sk-123', copied, onCopy: message('Clicked'), style },
    h,
  )

describe('InputCopy.view', () => {
  it('meets the input copy pattern', () => {
    expect(A11y.validate(Patterns.InputCopy, InputCopySlots)).toEqual([])
  })

  it('shows the value read-only, labelled', () => {
    const [input] = Inert.byTag(drawn(false), 'input')
    const [label] = Inert.byTag(drawn(false), 'label')
    expect(Inert.value(input, 'value')).toBe('sk-123')
    expect(Inert.value(input, 'readonly')).toBe('')
    expect(Inert.value(label, 'for')).toBe(Inert.value(input, 'id'))
  })

  it('names the button by its text and the label, and sends onCopy', () => {
    const [button] = Inert.byTag(drawn(false), 'button')
    const [label] = Inert.byTag(drawn(false), 'label')
    expect(Inert.value(button, 'aria-labelledby')).toBe(
      `${Inert.value(button, 'id')} ${Inert.value(label, 'id')}`,
    )
    expect(Inert.text(button)).toBe('Copy')
    expect(button?.data?.on?.['click']).toBeTypeOf('function')
  })

  it('says Copied on the button and in the status region, which is there before', () => {
    const idle = Inert.byRole(drawn(false), 'status')
    expect(idle.map(Inert.text)).toEqual([''])
    const [status] = Inert.byRole(drawn(true), 'status')
    const [button] = Inert.byTag(drawn(true), 'button')
    expect(Inert.text(status)).toBe('Copied')
    expect(Inert.text(button)).toBe('Copied')
    expect(Inert.value(button, 'data-copied')).toBe('true')
  })
})

describe('InputCopy.Copy', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const clipboard = (writeText: (text: string) => Promise<void>) =>
    vi.stubGlobal('navigator', { clipboard: { writeText } })

  it('writes the text and yields Copied', async () => {
    const written: Array<string> = []
    clipboard(text => {
      written.push(text)
      return Promise.resolve()
    })
    const result = await Effect.runPromise(InputCopy.Copy({ text: 'sk-123' }).effect)
    expect(result).toEqual(ClipboardMessage.Copied())
    expect(written).toEqual(['sk-123'])
  })

  it('yields CopyFailed when the clipboard refuses', async () => {
    clipboard(() => Promise.reject(new Error('denied')))
    const result = await Effect.runPromise(InputCopy.Copy({ text: 'sk-123' }).effect)
    expect(result).toEqual(ClipboardMessage.CopyFailed({ message: 'denied' }))
  })

  it('reads the clipboard when it runs, not when it is built', async () => {
    const command = InputCopy.Copy({ text: 'late' })
    const written: Array<string> = []
    clipboard(text => {
      written.push(text)
      return Promise.resolve()
    })
    expect(await Effect.runPromise(command.effect)).toEqual(ClipboardMessage.Copied())
    expect(written).toEqual(['late'])
  })
})

describe('InputCopy.update', () => {
  const copiedOnce = InputCopy.update(
    InputCopy.init({ resetAfter: 500 }),
    InputCopy.Message.Copied(),
  )

  it('shows Copied and begins a Reset for that copy after resetAfter', () => {
    expect(copiedOnce.model).toEqual({ copied: true, copies: 1, resetAfter: 500 })
    expect(copiedOnce.commands?.map(command => command.name)).toEqual(['InputCopy.Reset'])
  })

  it('goes back to Copy when the Reset for the latest copy elapses', () => {
    const { model } = InputCopy.update(
      copiedOnce.model,
      InputCopy.Message.ElapsedReset({ copy: 1 }),
    )
    expect(model.copied).toBe(false)
  })

  it("keeps a later copy's Copied when an earlier copy's Reset elapses", () => {
    const again = InputCopy.update(copiedOnce.model, InputCopy.Message.Copied()).model
    const { model } = InputCopy.update(again, InputCopy.Message.ElapsedReset({ copy: 1 }))
    expect(model).toBe(again)
    expect(model.copied).toBe(true)
  })

  it('returns the Model it was given when nothing shows as copied', () => {
    const idle = InputCopy.init()
    expect(InputCopy.update(idle, InputCopy.Message.ElapsedReset({ copy: 0 })).model).toBe(idle)
  })
})

describe('InputCopy.Reset', () => {
  it('yields ElapsedReset only once ms have passed', async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(InputCopy.Reset({ ms: 500, copy: 3 }).effect)
        yield* Effect.yieldNow
        yield* TestClock.adjust('499 millis')
        expect(fiber.pollUnsafe()).toBeUndefined()
        yield* TestClock.adjust('1 millis')
        return yield* Fiber.join(fiber)
      }).pipe(Effect.provide(TestClock.layer())),
    )
    expect(result).toEqual(InputCopy.Message.ElapsedReset({ copy: 3 }))
  })
})
