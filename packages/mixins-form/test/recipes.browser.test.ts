/// <reference types="@vitest/browser-playwright" />
/**
 * The shipped looks in a real browser: a text field is a field's height, a
 * toggle keeps a box's size in a field that stretches its control, a choice of
 * many is a finger's row, a failure reads in the error's ink, and the submit is
 * as wide as its words.
 */
import { Schema } from 'effect'
import { Form as Forms } from 'foldkit-form'
import { Layers, Style } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { afterEach, expect, it, vi } from 'vitest'
import { FieldSlots, FormSlots, FormView } from '../src/index.js'
import { Field, Form } from '../src/recipes.js'

const Signup = Forms.make(
  'Signup',
  Forms.input(
    Schema.Struct({
      email: Schema.String.check(Schema.isMinLength(1)).annotate({
        title: 'Email',
        description: 'Where the receipt goes',
      }),
      news: Schema.Boolean.annotate({ title: 'Send news' }),
      topics: Schema.Array(Schema.Literals(['news', 'offers'])).annotate({ title: 'Topics' }),
    }),
  ),
)
type Model = typeof Signup.initial
type Message = typeof Signup.Message.Type
const View = FormView.define(Signup, {
  field: FormView.field(Signup).pipe(Style.attach(Style.forSlots(FieldSlots)(Field({})))),
}).pipe(Style.attach(Style.forSlots(FormSlots)(Form({}))))

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

it('draws each control its size, a failure in the error’s ink, and a submit its words’ width', async () => {
  // The tokens the recipes read, as an application's sheet declares them.
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent = Style.stylesheet(
    Layers.standard.declare,
    Layers.standard.in('theme', Theme.root(Theme.standard(Theme.make({})))),
  )
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'recipes'
  container.style.inlineSize = '480px'
  document.body.append(container)
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model: Signup.bundle.Model,
      container,
      // Checked at once, so the empty email says why.
      init: () => ({
        model: Signup.bundle.update(Signup.initial, Signup.Message.ValidatedAll(), undefined).model,
      }),
      update: (model: Model, message: Message) => ({
        model: Signup.bundle.update(model, message, undefined).model,
      }),
      view: (model: Model, h: HtmlBuilder<Message>) =>
        View({ model, errors: [], canSubmit: true }, h),
    }),
  )
  try {
    const error = await vi.waitFor(() => {
      const found = document.querySelector('#Signup-email-error')
      expect(found).not.toBeNull()
      return found!
    })
    const description = document.querySelector('#Signup-email-description')!
    expect(getComputedStyle(error).color).not.toBe(getComputedStyle(description).color)

    const email = document.querySelector<HTMLElement>('#Signup-email')!
    expect(email.getBoundingClientRect().height).toBeGreaterThanOrEqual(32)
    const toggle = document.querySelector<HTMLElement>('#Signup-news')!
    expect(toggle.getBoundingClientRect().width).toBe(16)
    for (const box of document.querySelectorAll('input[name="topics"]')) {
      expect(box.parentElement!.getBoundingClientRect().height).toBeGreaterThanOrEqual(24)
    }
    const submit = document.querySelector<HTMLElement>('button[type="submit"]')!
    expect(submit.getBoundingClientRect().width).toBeLessThan(
      email.getBoundingClientRect().width / 2,
    )
  } finally {
    handle.dispose()
  }
})
