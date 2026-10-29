/// <reference types="@vitest/browser-playwright" />
/**
 * The date-time input on the real runtime, edited in the browser to seconds
 * and to milliseconds, and submitted through the browser's own validation:
 * the precision the recipe reads is one the input takes (#302).
 */
import { Schema } from 'effect'
import { Form } from 'foldkit-form'
import { FormView } from 'foldkit-mixins-form'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { afterEach, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { FieldRecipes } from '../src/index.js'
import { renderers } from '../src/html.js'

const Event = Form.make('Event', Form.input(Schema.Struct({ at: Schema.String })), {
  inputs: { at: FieldRecipes.dateTime({ stored: 'instant', zone: 'Europe/London' }).control },
})
type Model = typeof Event.initial
type Message = typeof Event.Message.Type
const View = FormView.define(Event, { renderers: renderers() })

afterEach(() => document.body.replaceChildren())

const mount = async (submitted: Array<unknown>) => {
  const container = document.createElement('div')
  container.id = 'date-time-form'
  document.body.append(container)
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model: Event.bundle.Model,
      container,
      init: () => ({ model: Event.fill(Event.initial, { at: '2026-07-01T08:30:00.000Z' }).model }),
      update: (model: Model, message: Message) => {
        const next = Event.bundle.update(model, message, undefined)
        if (next.outMessage?._tag === 'Submitted') submitted.push(next.outMessage.value)
        return { model: next.model, commands: next.commands ?? [] }
      },
      view: (model: Model, h: HtmlBuilder<Message>) =>
        View({ model, errors: [], canSubmit: true }, h),
    }),
  )
  await vi.waitFor(() =>
    expect(document.querySelector<HTMLInputElement>('input[name="at"]')?.value).toBe(
      '2026-07-01T09:30',
    ),
  )
  return handle
}

it.each([
  ['2026-07-01T09:30:12', '2026-07-01T08:30:12.000Z'],
  ['2026-07-01T09:30:12.345', '2026-07-01T08:30:12.345Z'],
])('takes %s, edited in the input, and submits it', async (typed, instant) => {
  const submitted: Array<unknown> = []
  const handle = await mount(submitted)
  try {
    const input = document.querySelector<HTMLInputElement>('input[name="at"]')!
    await userEvent.fill(input, typed)
    expect(input.validity.stepMismatch).toBe(false)
    await userEvent.click(
      Array.from(document.querySelectorAll('button')).find(
        button => button.textContent === 'Submit',
      )!,
    )
    await vi.waitFor(() => expect(submitted).toEqual([{ at: instant }]))
  } finally {
    handle.dispose()
  }
})
