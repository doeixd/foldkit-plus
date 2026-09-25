// @vitest-environment jsdom
/**
 * The drawn Builder as a form key, on a running page: a form view that gives
 * the key no inputs still draws it, and one that gives it the page's data
 * draws the canvas with that data.
 */
import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Composition, NodeId } from 'foldkit-composition'
import { Entity } from 'foldkit-entity'
import { Form } from 'foldkit-form'
import { FormView } from 'foldkit-mixins-form'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { afterEach, expect, it, vi } from 'vitest'
import { BuilderView } from 'foldkit-mixins-builder'
import { PageBuilder, PageView } from './fixture.js'

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

const PageForm = Form.make(
  'PageForm',
  Entity.input(
    Entity.define('Page', Schema.Struct({ id: Schema.String, document: Composition.Document })),
    Schema.Struct({ document: Composition.Document }),
  ),
  { inputs: { document: PageBuilder.inputWith(BuilderView.submodel(PageView)) } },
)
const Slot = Bundle.declare(
  PageForm.bundle.pipe(Bundle.withView(FormView.submodel(PageForm, FormView.define(PageForm)))),
  'page',
)
const Model = Schema.Struct({ ...Slot.fields })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Slot.cases })
type Message = typeof Message.Type
const Page = Bundle.parent({ Model, Message })
const Placed = Page.at(Slot, { onOut: () => model => ({ model }) })
const placements = Page.assemble(Placed)

// A page holding one Feed, whose view draws what its node reads.
const fed = PageBuilder.replace(
  PageBuilder.initial,
  Composition.Document.make({
    format: 1,
    roots: [NodeId.make('s')],
    nodes: {
      [NodeId.make('s')]: {
        block: 'Section',
        props: { tone: 'plain' },
        regions: { body: [NodeId.make('f')] },
      },
      [NodeId.make('f')]: { block: 'Feed', props: {}, regions: {} },
    },
  }),
)

const mount = (controls: Readonly<Record<string, unknown>> | undefined) => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0),
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  const container = document.createElement('div')
  container.id = 'page-form'
  document.body.appendChild(container)
  const update = placements.update()
  const initial = placements.initial({}).model
  return Runtime.embed(
    Runtime.makeElement(
      placements.complete({
        Model,
        container,
        init: () => ({
          model: {
            ...initial,
            page: PageForm.fill(initial.page, { document: fed.page.present }).model,
          },
        }),
        update: (model: Model, message: Message) => update(model, message),
        view: (model: Model, h: HtmlBuilder<Message>) =>
          h.main([], [Placed.view(model, h, controls === undefined ? {} : { controls })]),
        subscriptions: placements.subscriptions(),
      }),
    ),
  )
}
const feed = () => document.querySelector('[aria-label="Page"] .feed')?.textContent

it('draws the Builder in a form that gives its key no inputs', async () => {
  const handle = mount(undefined)
  try {
    await vi.waitFor(() => expect(feed()).toBe('waiting for its rows'))
    expect(document.querySelector('[role="tree"]')).not.toBeNull()
  } finally {
    handle.dispose()
  }
})

it('draws the canvas with the page’s data the form view gives its key', async () => {
  const handle = mount({ document: BuilderView.inputs({ data: { f: 'three posts' } }) })
  try {
    await vi.waitFor(() => expect(feed()).toBe('three posts'))
  } finally {
    handle.dispose()
  }
})
