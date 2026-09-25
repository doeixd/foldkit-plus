// @vitest-environment jsdom
/**
 * The Builder as a page form's `document` key, drawn by `foldkit-mixins-form`
 * and driven on the real Foldkit runtime: every click and keystroke is a
 * Message of the Builder, carried by the form.
 */
import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Composition } from 'foldkit-composition'
import { Entity } from 'foldkit-entity'
import { Form } from 'foldkit-form'
import { FormView } from 'foldkit-mixins-form'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { afterEach, expect, it, vi } from 'vitest'
import { PageBuilder, Site } from './fixture.js'

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

const Page = Entity.define(
  'Page',
  Schema.Struct({ id: Schema.String, title: Schema.String, document: Composition.Document }),
)
const PageForm = Form.make(
  'PageForm',
  Entity.input(
    Page,
    Schema.Struct({
      title: Page.fields.title.schema,
      document: Composition.Document.check(Composition.valid(Site)),
    }),
  ),
  { inputs: { document: PageBuilder.input } },
)

const Drawn = PageForm.bundle.pipe(
  Bundle.withView(FormView.submodel(PageForm, FormView.define(PageForm))),
)
const Slot = Bundle.declare(Drawn, 'page')
const Model = Schema.Struct({ ...Slot.fields, saved: Schema.Array(Schema.Unknown) })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Slot.cases })
type Message = typeof Message.Type
const Parent = Bundle.parent({ Model, Message })
const PagePlaced = Parent.at(Slot, {
  onOut: submitted => model => ({ model: { ...model, saved: [...model.saved, submitted.value] } }),
})
const placements = Parent.assemble(PagePlaced)

const buttonNamed = (name: string): HTMLButtonElement | undefined =>
  Array.from(document.querySelectorAll('button')).find(button => button.textContent === name)
const click = (name: string) => buttonNamed(name)?.click()
const canvas = () => document.querySelector('.builder-canvas')

it('builds a page with clicks and keys, through the form, and submits it', async () => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0),
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  const container = document.createElement('div')
  container.id = 'builder-runtime'
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
          h.main([], [PagePlaced.view(model, h, {})]),
        subscriptions: placements.subscriptions(),
      }),
    ),
  )
  try {
    await vi.waitFor(() => expect(buttonNamed('Add Section')).toBeDefined())
    // Buttons offers no starting props, so it is not in the palette.
    expect(buttonNamed('Add Button')).toBeUndefined()

    click('Add Section')
    await vi.waitFor(() => expect(canvas()?.querySelector('section')).not.toBeNull())
    click('Add Heading')
    await vi.waitFor(() => expect(canvas()?.querySelector('h2')?.textContent).toBe('New heading'))
    // The canvas marks each node, as edit mode does.
    expect(canvas()?.querySelectorAll('[data-composition-node]')).toHaveLength(2)

    const text = document.querySelector<HTMLInputElement>('.builder-properties input')
    if (text === null) throw new Error('expected the heading’s text input')
    text.value = 'Welcome'
    text.dispatchEvent(new Event('input', { bubbles: true }))
    await vi.waitFor(() => expect(canvas()?.querySelector('h2')?.textContent).toBe('Welcome'))

    click('Undo')
    await vi.waitFor(() => expect(canvas()?.querySelector('h2')?.textContent).toBe('New heading'))
    click('Redo')
    await vi.waitFor(() => expect(canvas()?.querySelector('h2')?.textContent).toBe('Welcome'))

    const title = document.getElementById('PageForm-title')
    if (!(title instanceof HTMLInputElement)) throw new Error('expected the title input')
    title.value = 'Home'
    title.dispatchEvent(new Event('input', { bubbles: true }))
    document.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }))
    await vi.waitFor(() => expect(latest?.saved).toHaveLength(1))
    expect(latest?.saved[0]).toMatchObject({ title: 'Home' })
  } finally {
    handle.dispose()
  }
})
