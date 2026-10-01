// @vitest-environment jsdom
import { Effect, Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Entity } from 'foldkit-entity'
import { Form, Input as FormInput } from 'foldkit-form'
import { Style } from 'foldkit-mixins'
import { InputSlots, TextareaSlots, Recipes } from 'foldkit-mixins-ui'
import { Inert } from 'foldkit-mixins/testing'
import { defineMessageUnion } from 'foldkit/message'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { afterEach, expect, it, vi } from 'vitest'
import { FormView } from '../src/index.js'
import * as UiForm from '../src/ui.js'

const Input = Schema.Struct({
  email: Schema.String.check(Schema.isMinLength(1)).annotate({
    title: 'Email',
    description: 'Work address',
  }),
  body: Schema.String.annotate({ title: 'Message' }),
})
const Signup = Form.make('Signup', Entity.input(Entity.define('Signup', Input), Input), {
  inputs: { body: FormInput.multiline() },
  checks: { email: () => Effect.as(Effect.sleep('500 millis'), 'Taken') },
  debounce: 0,
})
type FormMessage = typeof Signup.Message.Type
const override = UiForm.field({
  toMessage: (message: FormMessage) => message,
  inputStyle: Style.forSlots(InputSlots)(Recipes.Input()),
  textareaStyle: Style.forSlots(TextareaSlots)(Recipes.Textarea()),
})
const Fields = FormView.fields(Signup, {
  attrs: { email: { type: 'email', placeholder: 'Work email' }, body: { rows: 4 } },
  overrides: { email: override, body: override },
})
const Drawn = Signup.bundle.pipe(
  Bundle.withView(FormView.submodel(Signup, Fields.view, { canSubmit: Signup.isValid })),
)
const Declared = Bundle.declare(Drawn, 'signup')
const Model = Schema.Struct({ ...Declared.fields })
const Message = defineMessageUnion({ ...Declared.cases })
const Page = Bundle.parent({ Model, Message })
const placed = Page.at(Declared, { onOut: Bundle.ignore })
const assembly = Page.assemble(placed)

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.replaceChildren()
})

it('keeps typed controls, field names, required state, descriptions and every element slotted', () => {
  const tree = Inert.draw(Fields.view, { model: Signup.initial, errors: [], canSubmit: false })
  const email = Inert.byTag(tree, 'input')[0]
  expect(Inert.value(email, 'id')).toBe('Signup-email')
  expect(Inert.value(email, 'name')).toBe('email')
  expect(Inert.value(email, 'type')).toBe('email')
  expect(Inert.value(email, 'placeholder')).toBe('Work email')
  expect(Inert.value(email, 'aria-required')).toBe('true')
  expect(Inert.value(email, 'aria-describedby')).toBe('Signup-email-description')
  expect(Inert.byTag(tree, 'label').map(node => Inert.value(node, 'for'))).toEqual([
    'Signup-email',
    'Signup-body',
  ])
  const textarea = Inert.byTag(tree, 'textarea')[0]
  expect(Inert.value(textarea, 'name')).toBe('body')
  expect(Inert.value(textarea, 'rows')).toBe(4)
  expect(Inert.unslotted(tree)).toEqual([])
})

it('routes blur and edits through the Submodel, announces checking/rejection, and keeps a strict submit gate', async () => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0),
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  const container = document.createElement('div')
  container.id = 'ui-signup'
  document.body.append(container)
  const handle = Runtime.embed(
    Runtime.makeElement(
      assembly.runtime({
        Model,
        container,
        initial: {},
        view: (model: typeof Model.Type, h: HtmlBuilder<typeof Message.Type>) =>
          placed.view(model, h, {}),
      }),
    ),
  )
  const email = () => document.querySelector<HTMLInputElement>('#Signup-email')!
  const description = () => document.querySelector('#Signup-email-description')!
  try {
    await vi.waitFor(() => expect(email()).not.toBeNull())
    email().dispatchEvent(new Event('blur'))
    await vi.waitFor(() => expect(email().getAttribute('aria-invalid')).toBe('true'))
    expect(description().getAttribute('role')).toBe('alert')
    email().value = 'new@example.com'
    email().dispatchEvent(new Event('input', { bubbles: true }))
    await vi.waitFor(() => expect(email().getAttribute('aria-busy')).toBe('true'))
    expect(description().textContent).toBe('Work address Checking…')
    expect(description().getAttribute('role')).toBe('status')
    expect(document.querySelector('button')?.disabled).toBe(true)
    await vi.waitFor(() => expect(description().textContent).toBe('Work address Taken'))
    expect(description().getAttribute('role')).toBe('alert')
    expect(email().value).toBe('new@example.com')
  } finally {
    handle.dispose()
  }
})
