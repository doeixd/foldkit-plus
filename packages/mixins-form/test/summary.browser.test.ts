/// <reference types="@vitest/browser-playwright" />
/**
 * The list of fields to fix in a real browser: following a link focuses its
 * field's control, a choice group's first box for a group, by a click or by
 * Enter, and the page's address stays as it was.
 */
import { Schema } from 'effect'
import { Form } from 'foldkit-form'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { afterEach, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { FormView } from '../src/index.js'

const Signup = Form.make(
  'Signup',
  Form.input(
    Schema.Struct({
      email: Schema.String.check(Schema.isMinLength(1)).annotate({ title: 'Email' }),
      topics: Schema.NonEmptyArray(Schema.Literals(['news', 'offers'])).annotate({
        title: 'Topics',
      }),
    }),
  ),
)
type Model = typeof Signup.initial
type Message = typeof Signup.Message.Type
const View = FormView.define(Signup)

afterEach(() => document.body.replaceChildren())

const mount = async () => {
  const container = document.createElement('div')
  container.id = 'summary'
  document.body.append(container)
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model: Signup.bundle.Model,
      container,
      init: () => ({
        model: Signup.bundle.update(Signup.initial, Signup.Message.ValidatedAll(), undefined).model,
      }),
      update: (model: Model, message: Message) => ({
        model: Signup.bundle.update(model, message, undefined).model,
      }),
      view: (model: Model, h: HtmlBuilder<Message>) =>
        View({ model, errors: [], canSubmit: false }, h),
    }),
  )
  await vi.waitFor(() => expect(document.querySelectorAll('#Signup-summary a')).toHaveLength(2))
  return handle
}
const link = (words: string) =>
  Array.from(document.querySelectorAll<HTMLAnchorElement>('#Signup-summary a')).find(link =>
    link.textContent!.startsWith(words),
  )!

it('focuses the field a link names, and goes nowhere', async () => {
  const handle = await mount()
  const address = location.href
  try {
    await userEvent.click(link('Email'))
    expect(document.activeElement?.id).toBe('Signup-email')
    expect(location.href).toBe(address)
  } finally {
    handle.dispose()
  }
})

it('focuses a choice group’s first box', async () => {
  const handle = await mount()
  try {
    await userEvent.click(link('Topics'))
    const focused = document.activeElement as HTMLInputElement
    expect([focused.type, focused.name, focused.value]).toEqual(['checkbox', 'topics', 'news'])
  } finally {
    handle.dispose()
  }
})

it('follows a link by Enter, as a link is', async () => {
  const handle = await mount()
  try {
    link('Email').focus()
    await userEvent.keyboard('{Enter}')
    expect(document.activeElement?.id).toBe('Signup-email')
  } finally {
    handle.dispose()
  }
})
