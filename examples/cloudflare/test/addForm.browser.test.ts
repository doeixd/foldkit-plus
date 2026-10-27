/// <reference types="@vitest/browser-playwright" />
/**
 * The page's quick-add form in a real browser (#192): passing through the empty
 * field says nothing, a submit still says what is missing, and the field a
 * successful add empties stays quiet when focus leaves it.
 */
import { FormView } from 'foldkit-mixins-form'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { afterEach, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { AddTodoForm } from '../src/forms.js'

type Model = typeof AddTodoForm.initial
type Message = typeof AddTodoForm.Message.Type
const View = FormView.define(AddTodoForm)

afterEach(() => document.body.replaceChildren())

const mount = async () => {
  const container = document.createElement('div')
  container.id = 'add'
  document.body.append(container)
  const added: Array<string> = []
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model: AddTodoForm.bundle.Model,
      container,
      init: () => ({ model: AddTodoForm.initial }),
      update: (model: Model, message: Message) => {
        const next = AddTodoForm.bundle.update(model, message, undefined)
        if (next.outMessage === undefined) return { model: next.model }
        // As the page does: the title goes, and the form starts over.
        added.push(next.outMessage.value.title)
        return {
          model: AddTodoForm.bundle.update(next.model, AddTodoForm.Message.Reset(), undefined)
            .model,
        }
      },
      view: (model: Model, h: HtmlBuilder<Message>) =>
        h.div(
          [],
          [h.h2([h.Tabindex(-1)], ['Todos']), View({ model, errors: [], canSubmit: true }, h)],
        ),
    }),
  )
  await vi.waitFor(() => expect(field()).not.toBeNull())
  return { handle, added }
}
const field = () => document.getElementById('AddTodo-title') as HTMLInputElement | null
const error = () => document.getElementById('AddTodo-title-error')
const summary = () => document.querySelector('form ul')
const heading = () => document.querySelector('h2') as HTMLElement

it('says nothing about the field when focus only passes through it', async () => {
  const { handle } = await mount()
  try {
    await userEvent.click(field()!)
    expect(document.activeElement).toBe(field())
    await userEvent.tab()
    expect(document.activeElement).not.toBe(field())
    await userEvent.click(heading())
    expect(error()).toBeNull()
    expect(summary()).toBeNull()
    expect(field()!.getAttribute('aria-invalid')).toBe('false')
  } finally {
    handle.dispose()
  }
})

it('still says what is missing on a submit', async () => {
  const { handle, added } = await mount()
  try {
    await userEvent.click(field()!)
    await userEvent.keyboard('{Enter}')
    await vi.waitFor(() => expect(error()?.textContent).toBe('Required'))
    expect(field()!.getAttribute('aria-invalid')).toBe('true')
    // One field: its error is the summary, and it is the alert.
    expect(summary()).toBeNull()
    expect(error()!.getAttribute('role')).toBe('alert')
    expect(added).toEqual([])
  } finally {
    handle.dispose()
  }
})

it('leaves the field a successful add empties quiet when focus leaves it', async () => {
  const { handle, added } = await mount()
  try {
    await userEvent.click(field()!)
    await userEvent.keyboard('Milk{Enter}')
    await vi.waitFor(() => expect(added).toEqual(['Milk']))
    await vi.waitFor(() => expect(field()!.value).toBe(''))
    expect(document.activeElement).toBe(field())
    await userEvent.click(heading())
    expect(document.activeElement).toBe(heading())
    expect(error()).toBeNull()
    expect(summary()).toBeNull()
  } finally {
    handle.dispose()
  }
})
