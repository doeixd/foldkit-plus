// @vitest-environment jsdom
/**
 * The form drawn and driven on the real Foldkit runtime: DOM events reach the
 * form through its Submodel boundary, and a valid submit reaches the parent.
 */
import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
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
          h.main([], [EditForm.view(model, h, { options, submitLabel: 'Save' })]),
        subscriptions: placements.subscriptions(),
      }),
    ),
  )
  try {
    await vi.waitFor(() => expect(element('Edit-title')).not.toBeNull())
    const submit = document.querySelector('button') as HTMLButtonElement
    expect(submit.textContent).toBe('Save')
    expect(submit.disabled).toBe(true)

    // Leaving a required control empty says so, in the DOM a screen reader reads.
    element('Edit-title').dispatchEvent(new Event('blur'))
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
