// @vitest-environment jsdom
/**
 * The form drawn and driven on the real Foldkit runtime: DOM events reach the
 * form through its Submodel boundary, and a valid submit reaches the parent.
 */
import { Effect, Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Entity } from 'foldkit-entity'
import { Form } from 'foldkit-form'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { afterEach, expect, it, vi } from 'vitest'
import { FormView } from '../src/index.js'
import { Edit, EditInput, options } from './fixture.js'

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

// The form's own Bundle, given a view. Nothing else about it changes.
const Drawn = Edit.bundle.pipe(Bundle.withView(FormView.submodel(Edit, FormView.define(Edit))))

const Slot = Bundle.declare(Drawn, 'edit')
const Model = Schema.Struct({ ...Slot.fields, saved: Schema.Array(EditInput) })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Slot.cases })
type Message = typeof Message.Type

const Page = Bundle.parent({ Model, Message })
const EditForm = Page.at(Slot, {
  onOut: submitted => model => ({ model: { ...model, saved: [...model.saved, submitted.value] } }),
})
const placements = Page.assemble(EditForm)

const element = <E extends HTMLElement>(id: string): E => document.getElementById(id) as E
const type = (id: string, value: string) => {
  const input = element<HTMLInputElement>(id)
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
}
const choose = (id: string, value: string) => {
  const select = element<HTMLSelectElement>(id)
  select.value = value
  select.dispatchEvent(new Event('change', { bubbles: true }))
}

it('types, picks, and submits through the DOM, and hands the parent the decoded value', async () => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0),
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  const container = document.createElement('div')
  container.id = 'form-runtime'
  document.body.appendChild(container)

  let latest: Model | undefined
  const update = placements.update()
  const handle = Runtime.embed(
    Runtime.makeElement(
      placements.complete({
        Model,
        container,
        init: () => {
          const initial = placements.initial({ saved: [] })
          return EditForm.helpers.fill({ id: 'p1' })(initial.model)
        },
        update: (model: Model, message: Message) => {
          const next = update(model, message)
          latest = next.model
          return next
        },
        view: (model: Model, h: HtmlBuilder<Message>) =>
          h.main([], [EditForm.view(model, h, { options, words: { submit: 'Save' } })]),
        subscriptions: placements.subscriptions(),
      }),
    ),
  )
  try {
    await vi.waitFor(() => expect(element('Edit-title')).not.toBeNull())
    const submit = document.querySelector('button') as HTMLButtonElement
    expect(submit.textContent).toBe('Save')
    expect(submit.disabled).toBe(true)

    // Emptying a required control says so, in the DOM a screen reader reads.
    // Leaving it untouched says nothing (#192).
    element('Edit-title').dispatchEvent(new Event('blur'))
    type('Edit-title', 'x')
    type('Edit-title', '')
    await vi.waitFor(() => expect(element('Edit-title-error')?.textContent).toBe('Required'))
    expect(element('Edit-title').getAttribute('aria-invalid')).toBe('true')

    type('Edit-title', 'Hello')
    await vi.waitFor(() => expect(element('Edit-title-error')).toBeNull())
    type('Edit-rating', '4')
    choose('Edit-status', 'live')
    choose('Edit-editorId', 'a2')
    element('Edit-featured').click()
    const [, databases] = Array.from(
      element('Edit-tagIds').querySelectorAll<HTMLInputElement>('input'),
    )
    databases?.click()

    await vi.waitFor(() => expect(submit.disabled).toBe(false))
    document.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }))

    await vi.waitFor(() => expect(latest?.saved).toHaveLength(1))
    expect(latest?.saved[0]).toEqual({
      id: 'p1',
      title: 'Hello',
      status: 'live',
      rating: 4,
      featured: true,
      editorId: 'a2',
      tagIds: ['t2'],
    })
  } finally {
    handle.dispose()
  }
})

// A check that never answers: the key stays checked, and a submit stays waiting.
const Signup = Schema.Struct({
  email: Schema.String.check(Schema.isMinLength(1)).annotate({ title: 'Email' }),
})
const Join = Form.make('Join', Entity.input(Entity.define('Signup', Signup), Signup), {
  checks: { email: () => Effect.never },
  debounce: 0,
})
const JoinSlot = Bundle.declare(
  Join.bundle.pipe(Bundle.withView(FormView.submodel(Join, FormView.define(Join)))),
  'join',
)
const JoinModel = Schema.Struct({ ...JoinSlot.fields })
type JoinModel = typeof JoinModel.Type
const JoinMessage = defineMessageUnion({ ...JoinSlot.cases })
type JoinMessage = typeof JoinMessage.Type
const JoinPage = Bundle.parent({ Model: JoinModel, Message: JoinMessage })
const JoinForm = JoinPage.at(JoinSlot, { onOut: () => model => ({ model }) })
const joinPlacements = JoinPage.assemble(JoinForm)

it('shows a check running under its control, and a submit waiting for it', async () => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0),
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  const container = document.createElement('div')
  container.id = 'join-runtime'
  document.body.appendChild(container)

  const handle = Runtime.embed(
    Runtime.makeElement(
      joinPlacements.complete({
        Model: JoinModel,
        container,
        init: () => joinPlacements.initial({}),
        update: joinPlacements.update(),
        view: (model: JoinModel, h: HtmlBuilder<JoinMessage>) =>
          h.main([], [JoinForm.view(model, h, { words: { submitting: 'Joining…' } })]),
        subscriptions: joinPlacements.subscriptions(),
      }),
    ),
  )
  try {
    await vi.waitFor(() => expect(element('Join-email')).not.toBeNull())
    const field = () => element('Join-email').parentElement
    expect(field()?.dataset['validation']).toBe('NotValidated')

    type('Join-email', 'ada@example.com')
    await vi.waitFor(() => expect(element('Join-email-checking')?.textContent).toBe('Checking…'))
    expect(field()?.dataset['validation']).toBe('Validating')
    expect(element('Join-email').getAttribute('aria-describedby')).toBe('Join-email-checking')
    const submit = document.querySelector('button') as HTMLButtonElement
    expect(submit.disabled).toBe(false)

    document.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }))
    await vi.waitFor(() => expect(submit.textContent).toBe('Joining…'))
    expect(submit.disabled).toBe(true)
    expect(document.querySelector('form')?.getAttribute('aria-busy')).toBe('true')
  } finally {
    handle.dispose()
  }
})

it('asks for more choices from a picker the view says has more, and from no other', async () => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0),
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  const container = document.createElement('div')
  container.id = 'form-more'
  document.body.appendChild(container)

  const received: Array<Message> = []
  const update = placements.update()
  const handle = Runtime.embed(
    Runtime.makeElement(
      placements.complete({
        Model,
        container,
        init: () => placements.initial({ saved: [] }),
        update: (model: Model, message: Message) => {
          received.push(message)
          return update(model, message)
        },
        view: (model: Model, h: HtmlBuilder<Message>) =>
          h.main(
            [],
            [
              EditForm.view(model, h, {
                options,
                more: { editorId: true },
                words: { more: 'More' },
              }),
            ],
          ),
        subscriptions: placements.subscriptions(),
      }),
    ),
  )
  try {
    await vi.waitFor(() => expect(element('Edit-editorId')).not.toBeNull())
    const buttons = Array.from(document.querySelectorAll('button')).filter(
      button => button.textContent === 'More',
    )
    // One button, for the one picker said to have more, controlling that picker.
    expect(buttons.map(button => button.getAttribute('aria-controls'))).toEqual(['Edit-editorId'])
    buttons[0]!.click()
    await vi.waitFor(() =>
      expect(received).toContainEqual(
        Message.GotEditMessage({ message: Edit.Message.AskedForMore({ key: 'editorId' }) }),
      ),
    )
  } finally {
    handle.dispose()
  }
})

it('keeps both of two presses made before the next draw', async () => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0),
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  const container = document.createElement('div')
  container.id = 'form-presses'
  document.body.appendChild(container)

  let latest: Model | undefined
  const update = placements.update()
  const handle = Runtime.embed(
    Runtime.makeElement(
      placements.complete({
        Model,
        container,
        init: () => placements.initial({ saved: [] }),
        update: (model: Model, message: Message) => {
          const next = update(model, message)
          latest = next.model
          return next
        },
        view: (model: Model, h: HtmlBuilder<Message>) =>
          h.main([], [EditForm.view(model, h, { options })]),
        subscriptions: placements.subscriptions(),
      }),
    ),
  )
  try {
    await vi.waitFor(() => expect(element('Edit-featured')).not.toBeNull())
    const boxes = Array.from(
      document.querySelectorAll<HTMLInputElement>('[role="group"] input[type="checkbox"]'),
    )
    // Both in one task: no frame draws the first press before the second.
    boxes[0]!.click()
    boxes[1]!.click()
    element<HTMLInputElement>('Edit-featured').click()
    element<HTMLInputElement>('Edit-featured').click()
    await vi.waitFor(() =>
      expect(latest && Edit.field(latest.edit, 'tagIds').value).toEqual(['t1', 't2']),
    )
    // Pressed twice, the flag is back where it was.
    expect(Edit.field(latest!.edit, 'featured').value).toBe(false)
  } finally {
    handle.dispose()
  }
})
