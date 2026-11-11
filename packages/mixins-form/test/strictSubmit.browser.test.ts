/// <reference types="@vitest/browser-playwright" />
/**
 * A form made with `submitWaits: false` refuses a submit while a check runs,
 * from the Model: Enter and a press of the `aria-disabled` button hand out
 * nothing, and the answer landing afterwards sends nothing either.
 */
import { Effect, Schema } from 'effect'
import { Form } from 'foldkit-form'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { afterEach, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { FormView } from '../src/index.js'

let answer: () => void = () => {}
const answered = new Promise<void>(resolve => {
  answer = resolve
})

const Signup = Form.make(
  'Signup',
  Form.input(
    Schema.Struct({
      email: Schema.String.check(Schema.isMinLength(1)).annotate({ title: 'Email' }),
    }),
  ),
  {
    debounce: 0,
    submitWaits: false,
    checks: { email: () => Effect.promise(() => answered).pipe(Effect.as(undefined)) },
  },
)
type Model = typeof Signup.initial
type Message = typeof Signup.Message.Type
const View = FormView.define(Signup)

let submitted: Array<unknown> = []

afterEach(() => document.body.replaceChildren())

const mount = async () => {
  submitted = []
  const container = document.createElement('div')
  container.id = 'strict-submit'
  document.body.append(container)
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model: Signup.bundle.Model,
      container,
      init: () => ({ model: Signup.initial }),
      update: (model: Model, message: Message) => {
        const result = Signup.bundle.update(model, message, undefined)
        if (result.outMessage !== undefined) submitted.push(result.outMessage.value)
        return { model: result.model, commands: result.commands ?? [] }
      },
      view: (model: Model, h: HtmlBuilder<Message>) =>
        View({ model, errors: [], canSubmit: Signup.canSubmit(model) }, h),
    }),
  )
  await vi.waitFor(() => expect(email()).not.toBeNull())
  return handle
}

const email = () => document.getElementById('Signup-email') as HTMLInputElement
const button = () => document.querySelector<HTMLButtonElement>('form button[type="submit"]')!

it('hands out nothing while a check runs, however it is sent, and not when the answer lands', async () => {
  const handle = await mount()
  try {
    await userEvent.fill(email(), 'ada@example.com')
    await vi.waitFor(() => expect(email().getAttribute('aria-busy')).toBe('true'))
    expect(button().getAttribute('aria-disabled')).toBe('true')

    await userEvent.type(email(), '{Enter}')
    button().focus()
    button().click()
    await vi.waitFor(() => expect(document.activeElement).toBe(button()))
    expect(submitted).toEqual([])

    answer()
    await vi.waitFor(() => expect(email().getAttribute('aria-busy')).toBeNull())
    await vi.waitFor(() => expect(button().hasAttribute('aria-disabled')).toBe(false))
    expect(submitted).toEqual([])

    await userEvent.type(email(), '{Enter}')
    await vi.waitFor(() => expect(submitted).toEqual([{ email: 'ada@example.com' }]))
  } finally {
    handle.dispose()
  }
})
