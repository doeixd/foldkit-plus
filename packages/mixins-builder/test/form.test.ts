// @vitest-environment jsdom
/**
 * The drawn Builder as a form key, on a running page: a form view that gives
 * the key no inputs still draws it, one that gives it the page's data draws
 * the canvas with that data, and one that gives it a relation prop's choices
 * draws that prop's picker with them.
 */
import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Composition, type Document, type Node, NodeId } from 'foldkit-composition'
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

/** A page of one Section holding `node`, as `f`. */
const holding = (node: Node) =>
  Composition.Document.make({
    format: 1,
    roots: [NodeId.make('s')],
    nodes: {
      [NodeId.make('s')]: {
        block: 'Section',
        props: { tone: 'plain' },
        regions: { body: [NodeId.make('f')] },
      },
      [NodeId.make('f')]: node,
    },
  })
// A Feed's view draws what its node reads.
const fed = holding({ block: 'Feed', props: {}, regions: {} })

const mount = (controls: Readonly<Record<string, unknown>> | undefined, page: Document = fed) => {
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
            page: PageForm.fill(initial.page, { document: page }).model,
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

it('draws a relation prop’s picker with the choices the form view gives the Builder', async () => {
  const handle = mount(
    {
      document: BuilderView.inputs({
        options: {
          'Featured.category': [
            { value: 'c1', label: 'Chairs' },
            { value: 'c2', label: 'Tables' },
          ],
          'Featured.maker': [{ value: 'm1', label: 'Acme' }],
          'Featured.tags': [
            { value: 't1', label: 'Oak' },
            { value: 't2', label: 'Pine' },
          ],
        },
      }),
    },
    holding({
      block: 'Featured',
      props: { category: 'c1', maker: 'm1', tags: ['gone'] },
      regions: {},
    }),
  )
  const featured = () => document.querySelector('[aria-label="Page"] .featured')?.textContent
  try {
    await vi.waitFor(() => expect(featured()).toBe('c1: gone'))
    // A click on the page selects its node, once the canvas's Behavior is attached.
    await vi.waitFor(() => {
      document.querySelector<HTMLElement>('[aria-label="Page"] .featured')?.click()
      expect(document.querySelector('[data-builder-row="f"]')?.getAttribute('aria-selected')).toBe(
        'true',
      )
    })
    const category = await vi.waitFor(() => {
      const select = document.querySelector<HTMLSelectElement>('select[id$="-f-category"]')
      expect(select).not.toBeNull()
      return select
    })
    // Optional, so it offers none; the choices by their names.
    expect(Array.from(category?.options ?? [], option => option.text)).toEqual([
      'none',
      'Chairs',
      'Tables',
    ])
    expect(category?.value).toBe('c1')
    // Required, and chosen: nothing to go back to.
    const maker = document.querySelector<HTMLSelectElement>('select[id$="-f-maker"]')
    expect(Array.from(maker?.options ?? [], option => option.text)).toEqual(['Acme'])
    if (category !== null) {
      category.value = 'c2'
      category.dispatchEvent(new Event('change', { bubbles: true }))
    }
    await vi.waitFor(() => expect(featured()).toBe('c2: gone'))
    // A tag the choices lack stays chosen, shown, until it is let go.
    const tags = () =>
      Array.from(document.querySelectorAll<HTMLInputElement>('[aria-label="tags"] input'), box => [
        box.parentElement?.textContent,
        box.checked,
      ])
    expect(tags()).toEqual([
      ['Oak', false],
      ['Pine', false],
      ['? gone', true],
    ])
    document.querySelector<HTMLElement>('[aria-label="tags"] input[value="t2"]')?.click()
    await vi.waitFor(() => expect(featured()).toBe('c2: gone, t2'))
    document.querySelector<HTMLElement>('[aria-label="tags"] input[value="gone"]')?.click()
    await vi.waitFor(() => expect(featured()).toBe('c2: t2'))
    const none = document.querySelector<HTMLSelectElement>('select[id$="-f-category"]')
    if (none !== null) {
      none.value = ''
      none.dispatchEvent(new Event('change', { bubbles: true }))
    }
    await vi.waitFor(() => expect(featured()).toBe('none: t2'))
  } finally {
    handle.dispose()
  }
})
