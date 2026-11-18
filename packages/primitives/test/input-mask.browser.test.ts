/**
 * `InputMask` in a real browser, typed into with real keys: the caret the
 * browser leaves in the text typed is not the caret of the masked text, which
 * jsdom, with one synthetic `input` event, cannot show (#590).
 */
import { Effect, Fiber, Schema, Stream } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { liveViewStateChanges } from 'foldkit/mount'
import * as Runtime from 'foldkit/runtime'
import { afterEach, expect, it } from 'vitest'
import { userEvent } from 'vitest/browser'
import { Input, InputMask } from '../src/dom/input-mask.js'

afterEach(() => {
  document.body.innerHTML = ''
})

const PHONE = '(###) ###-####'

/** A focused field under the Mount, and every `Input` it reports. */
const mount = async (pattern = PHONE) => {
  const field = document.createElement('input')
  document.body.append(field)
  const facts: Array<typeof Input.Type> = []
  const fiber = Effect.runFork(
    Stream.runForEach(InputMask({ pattern }).f(field, liveViewStateChanges), fact =>
      Effect.sync(() => facts.push(fact)),
    ),
  )
  await new Promise(resolve => setTimeout(resolve, 20))
  field.focus()
  return { field, facts, stop: () => Effect.runPromise(Fiber.interrupt(fiber)) }
}

it('typing digits straight through fills the mask in order', async () => {
  const { field, facts, stop } = await mount()
  try {
    await userEvent.keyboard('5551234567')
    expect(field.value).toBe('(555) 123-4567')
    expect(field.selectionStart).toBe(field.value.length)
    expect(facts[facts.length - 1]).toEqual(
      Input.make({ value: '(555) 123-4567', raw: '5551234567' }),
    )
  } finally {
    await stop()
  }
})

it('a digit typed in the middle goes where the caret was, and the next follows it', async () => {
  const { field, stop } = await mount()
  try {
    await userEvent.keyboard('55512')
    expect(field.value).toBe('(555) 12')
    // After the second 5.
    field.setSelectionRange(3, 3)
    await userEvent.keyboard('9')
    expect(field.value).toBe('(559) 512')
    expect(field.selectionStart).toBe(4)
    await userEvent.keyboard('1')
    expect(field.value).toBe('(559) 151-2')
    expect(field.selectionStart).toBe(7)
  } finally {
    await stop()
  }
})

it('Backspace with the caret just after a literal takes the digit before it', async () => {
  const { field, stop } = await mount()
  try {
    await userEvent.keyboard('5551')
    expect(field.value).toBe('(555) 1')
    // Before the 1, after ") ".
    field.setSelectionRange(6, 6)
    await userEvent.keyboard('{Backspace}')
    expect(field.value).toBe('(551')
    expect(field.selectionStart).toBe(3)
  } finally {
    await stop()
  }
})

it('Backspace on a digit takes it and keeps the caret where it was', async () => {
  const { field, stop } = await mount()
  try {
    await userEvent.keyboard('5551234')
    expect(field.value).toBe('(555) 123-4')
    await userEvent.keyboard('{Backspace}{Backspace}')
    expect(field.value).toBe('(555) 12')
    expect(field.selectionStart).toBe(field.value.length)
  } finally {
    await stop()
  }
})

it('a pasted whole number is masked, with the caret at its end', async () => {
  const { field, stop } = await mount()
  try {
    document.execCommand('insertText', false, '5551234567')
    expect(field.value).toBe('(555) 123-4567')
    expect(field.selectionStart).toBe(field.value.length)
    field.select()
    document.execCommand('insertText', false, '555.123.4567')
    expect(field.value).toBe('(555) 123-4567')
  } finally {
    await stop()
  }
})

it('an input method’s composition is left alone until it is committed', async () => {
  const { field, stop } = await mount('###-###')
  try {
    field.dispatchEvent(new CompositionEvent('compositionstart'))
    field.value = '12'
    field.dispatchEvent(
      new InputEvent('input', { inputType: 'insertCompositionText', isComposing: true }),
    )
    field.value = '1234'
    field.dispatchEvent(
      new InputEvent('input', { inputType: 'insertCompositionText', isComposing: true }),
    )
    expect(field.value).toBe('1234')
    field.dispatchEvent(new CompositionEvent('compositionend'))
    expect(field.value).toBe('123-4')
  } finally {
    await stop()
  }
})

/** Frames wait, as on a loaded machine, until they are let through. */
const holdFrames = () => {
  const real = window.requestAnimationFrame.bind(window)
  const held: Array<FrameRequestCallback> = []
  window.requestAnimationFrame = callback => held.push(callback)
  return () => {
    window.requestAnimationFrame = real
    for (const callback of held.splice(0)) real(callback)
  }
}

it('keys faster than a frame still fill the mask of a controlled field in order', async () => {
  const Model = Schema.Struct({ value: Schema.String })
  const container = document.createElement('div')
  container.id = 'mask-host'
  document.body.append(container)
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: { value: '' } }),
      update: (_: typeof Model.Type, message: typeof Input.Type) => ({
        model: { value: message.value },
      }),
      view: (model: typeof Model.Type, h: HtmlBuilder<typeof Input.Type>) =>
        h.input([h.Id('phone'), h.Value(model.value), h.OnMount(InputMask({ pattern: PHONE }))]),
    }),
  )
  try {
    await expect.poll(() => document.getElementById('phone')).not.toBeNull()
    const field = document.getElementById('phone') as HTMLInputElement
    field.focus()
    const release = holdFrames()
    await userEvent.keyboard('5551234567')
    release()
    await expect.poll(() => field.value).toBe('(555) 123-4567')
    expect(field.selectionStart).toBe(field.value.length)
  } finally {
    handle.dispose()
  }
})
