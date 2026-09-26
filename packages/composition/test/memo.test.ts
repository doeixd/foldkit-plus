// @vitest-environment jsdom
/**
 * On the runtime, a node is drawn again only when what it reads changed: an
 * edit redraws the node it touched and the nodes holding it, and a change
 * elsewhere in the Model redraws no node.
 */
import { Result, Schema } from 'effect'
import { Block, Catalog, Composition, Content, NodeId, Region } from 'foldkit-composition'
import { Renderer } from 'foldkit-composition/foldkit'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { afterEach, expect, it, vi } from 'vitest'

const Section = Block.define('Section', {
  Props: Schema.Struct({}),
  regions: { body: Region.many({ accepts: [Content.Flow] }) },
  provides: [Content.Section],
})
const Heading = Block.define('Heading', {
  Props: Schema.Struct({ text: Schema.String }),
  provides: [Content.Flow],
})
const Site = Catalog.make({ blocks: [Section, Heading], roots: [Content.Section] })

// How often each node's view ran, by the node's text or Block.
const drawn: Array<string> = []
const SiteRenderer = Renderer.make(Site, {
  Section: ({ regions, h }) => {
    drawn.push('Section')
    return h.section([], [...regions.body])
  },
  Heading: ({ props, h }) => {
    drawn.push(props.text)
    return h.h2([], [props.text])
  },
})

const id = NodeId.make
const page = Schema.decodeUnknownSync(Composition.Document)({
  format: 1,
  roots: ['s'],
  nodes: {
    s: { block: 'Section', props: {}, regions: { body: ['a', 'b'] } },
    a: { block: 'Heading', props: { text: 'First' }, regions: {} },
    b: { block: 'Heading', props: { text: 'Second' }, regions: {} },
  },
})

const Model = Schema.Struct({ page: Composition.Document, count: Schema.Number })
type Model = typeof Model.Type
const Message = defineMessageUnion({
  Retitled: { id: Schema.String, text: Schema.String },
  Counted: {},
  Swapped: {},
})
type Message = typeof Message.Type

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

it('redraws only the nodes an edit reached, and none for a change elsewhere', async () => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0),
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  const container = document.createElement('div')
  container.id = 'memo'
  document.body.appendChild(container)
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: { page, count: 0 } }),
      update: (model: Model, message: Message) => {
        switch (message._tag) {
          case 'Counted':
            return { model: { ...model, count: model.count + 1 } }
          case 'Swapped': {
            const moved = Composition.apply(
              Site,
              model.page,
              Composition.Op.move(id('b'), Composition.region(id('s'), 'body', 0)),
            )
            if (Result.isFailure(moved)) throw new Error('the move is valid')
            return { model: { ...model, page: moved.success.document } }
          }
          case 'Retitled': {
            const edited = Composition.apply(
              Site,
              model.page,
              Composition.Op.setProp(id(message.id), 'text', message.text),
            )
            if (Result.isFailure(edited)) throw new Error('the edit is valid')
            return { model: { ...model, page: edited.success.document } }
          }
        }
      },
      view: (model: Model, h: HtmlBuilder<Message>) =>
        h.main(
          [],
          [
            h.button([h.Id('count'), h.OnClick(Message.Counted())], [String(model.count)]),
            h.button(
              [h.Id('retitle'), h.OnClick(Message.Retitled({ id: 'b', text: 'Changed' }))],
              ['Retitle'],
            ),
            h.button([h.Id('swap'), h.OnClick(Message.Swapped())], ['Swap']),
            ...Renderer.render(SiteRenderer, model.page, h),
          ],
        ),
    }),
  )
  const press = (button: string) => document.querySelector<HTMLButtonElement>(`#${button}`)?.click()
  // The runtime draws in place of the container, so the page is read from the document.
  const text = () => Array.from(document.querySelectorAll('h2'), node => node.textContent)
  try {
    await vi.waitFor(() => expect(text()).toEqual(['First', 'Second']))
    drawn.length = 0

    press('count')
    await vi.waitFor(() => expect(document.querySelector('#count')?.textContent).toBe('1'))
    expect(drawn).toEqual([])

    press('retitle')
    await vi.waitFor(() => expect(text()).toEqual(['First', 'Changed']))
    // The Heading edited, and the Section holding it; not its sibling.
    expect(drawn).toEqual(['Changed', 'Section'])

    // A node moved among its siblings keeps its drawing and moves with it:
    // keyed by node, not matched by position.
    drawn.length = 0
    press('swap')
    await vi.waitFor(() => expect(text()).toEqual(['Changed', 'First']))
    expect(drawn).toEqual(['Section'])
  } finally {
    handle.dispose()
  }
})
