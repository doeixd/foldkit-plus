// @vitest-environment jsdom
/**
 * Stateful Blocks: the page lists its stateful nodes, and a placed collection
 * holds one Bundle per node, keyed by its id, kept in step with the page: a new
 * node added and prepared from its props, a gone one removed, a changed one
 * started again. Each node is drawn by its own item.
 */
import { Option, Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { inertHtml, type Html, type HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Submodel from 'foldkit/submodel'
import { SlotView } from 'foldkit-mixins'
import * as Runtime from 'foldkit/runtime'
import { describe, expect, it, vi } from 'vitest'
import {
  Block,
  Catalog,
  Composition,
  Content,
  NodeId,
  Region,
  type Document,
} from '../src/index.js'
import { Renderer, Stateful } from '../src/foldkit/index.js'

// A counter that starts where its node's props say.
const CounterModel = Schema.Struct({ count: Schema.Number })
const CounterMessage = defineMessageUnion({ Incremented: {} })
const Counter = Bundle.make('Counter', {
  Model: CounterModel,
  Message: CounterMessage,
  init: () => ({ model: { count: 0 } }),
  update: model => ({ model: { count: model.count + 1 } }),
  view: Submodel.defineView<typeof CounterModel.Type, typeof CounterMessage.Type>((model, h) =>
    h.button([h.OnClick(CounterMessage.Incremented())], [String(model.count)]),
  ),
})

const Tally = Block.define('Tally', {
  Props: Schema.Struct({ start: Schema.Number }),
  provides: [Content.Flow],
  stateful: true,
})
const Heading = Block.define('Heading', {
  Props: Schema.Struct({ text: Schema.String }),
  provides: [Content.Flow],
})
const Section = Block.define('Section', {
  Props: Schema.Struct({}),
  regions: { body: Region.many({ accepts: [Content.Flow] }) },
  provides: [Content.Section],
})
const Site = Catalog.make({ blocks: [Section, Heading, Tally], roots: [Content.Section] })

const Tallies = Bundle.declareEach(Counter, 'tallies')
const Model = Schema.Struct({ ...Tallies.fields })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Tallies.cases })
type Message = typeof Message.Type
const Page = Bundle.parent({ Model, Message })
const Placed = Page.each(Tallies)

const page = (tallies: Readonly<Record<string, number>>): Document =>
  Schema.decodeUnknownSync(Composition.Document)({
    format: 1,
    roots: ['s'],
    nodes: {
      s: { block: 'Section', props: {}, regions: { body: ['h', ...Object.keys(tallies)] } },
      h: { block: 'Heading', props: { text: 'Scores' }, regions: {} },
      ...Object.fromEntries(
        Object.entries(tallies).map(([id, start]) => [
          id,
          { block: 'Tally', props: { start }, regions: {} },
        ]),
      ),
    },
  })

const sync = (model: Model, before: Document | undefined, after: Document) =>
  Stateful.sync(Placed, Site, Tally, { before, after }, (counter, props) => ({
    ...counter,
    count: props.start,
  }))(model).model

const SiteRenderer = Renderer.make(Site, {
  Section: ({ regions, h }) => h.section([], [...regions.body]),
  Heading: ({ props, h }) => h.h2([], [props.text]),
  Tally: ({ data }) => Stateful.html(data),
})
// On a runtime, a stateful node's item dispatches the page's Messages.
const PageRenderer = Renderer.forMessages<Message>().make(Site, {
  Section: ({ regions, h }) => h.section([], [...regions.body]),
  Heading: ({ props, h }) => h.h2([], [props.text]),
  Tally: ({ data }) => Stateful.html(data),
})

// The page's own `document` is the composition Document; this is the DOM's.
const document_ = globalThis.document
const text = (nodes: ReadonlyArray<Html | string>): string =>
  nodes
    .map(node =>
      node === null
        ? ''
        : typeof node === 'string'
          ? node
          : `${node.text ?? ''}${text(node.children ?? [])}`,
    )
    .join(' ')
    .trim()

describe('stateful Blocks', () => {
  it('lists a page’s stateful nodes, in the order it draws them', () => {
    const nodes = Composition.statefulNodes(Site, page({ a: 1, b: 5 }))
    expect(nodes.map(node => [node.id, node.props])).toEqual([
      ['a', { start: 1 }],
      ['b', { start: 5 }],
    ])
    expect(Composition.statefulNodes(Site, page({ a: 1 }), 'Heading')).toEqual([])
    expect(Heading.stateful).toBe(false)
  })

  it('keeps a collection in step with the page: adds, removes, and restarts a change', () => {
    const first = page({ a: 1, b: 5 })
    const placed = sync({ tallies: {} }, undefined, first)
    expect(placed.tallies).toEqual({ a: { count: 1 }, b: { count: 5 } })
    // The counter's own state moves on, and the page is not touched by that.
    const clicked = Option.getOrThrow(
      Placed.update(placed, Tallies.wrapper.make('a', CounterMessage.Incremented())),
    ).model
    expect(clicked.tallies['a']).toEqual({ count: 2 })
    // b is gone, c is new, and a unchanged keeps its state.
    const second = Schema.decodeUnknownSync(Composition.Document)({
      ...first,
      nodes: {
        ...first.nodes,
        s: { ...first.nodes[NodeId.make('s')], regions: { body: ['h', 'a', 'c'] } },
        c: { block: 'Tally', props: { start: 9 }, regions: {} },
      },
    })
    const moved = sync(clicked, first, second)
    expect(moved.tallies).toEqual({ a: { count: 2 }, c: { count: 9 } })
    // a's props change: it starts again from them.
    const third = Schema.decodeUnknownSync(Composition.Document)({
      ...second,
      nodes: { ...second.nodes, a: { block: 'Tally', props: { start: 7 }, regions: {} } },
    })
    expect(sync(moved, second, third).tallies).toEqual({ a: { count: 7 }, c: { count: 9 } })
  })

  it('draws each stateful node with its own item, on a runtime', async () => {
    const document = page({ a: 1, b: 5 })
    const container = document_.createElement('div')
    container.id = 'page'
    document_.body.appendChild(container)
    const placements = Page.assemble(Placed)
    const update = placements.update()
    const handle = Runtime.embed(
      Runtime.makeElement(
        placements.complete({
          Model,
          container,
          init: () => ({ model: sync({ tallies: {} }, undefined, document) }),
          update: (model: Model, message: Message) => update(model, message),
          view: (model: Model, h: HtmlBuilder<Message>) =>
            h.main(
              [],
              Renderer.render(PageRenderer, document, h, {
                data: Stateful.views(Placed, Site, Tally, document, model, h),
              }),
            ),
          subscriptions: placements.subscriptions(),
        }),
      ),
    )
    try {
      const buttons = () => Array.from(document_.querySelectorAll('button'))
      await vi.waitFor(() =>
        expect(buttons().map(button => button.textContent)).toEqual(['1', '5']),
      )
      buttons()[1]?.click()
      await vi.waitFor(() =>
        expect(buttons().map(button => button.textContent)).toEqual(['1', '6']),
      )
      expect(document_.querySelector('h2')?.textContent).toBe('Scores')
      // Not placed yet, a stateful node draws nothing.
      expect(Stateful.html(undefined)).toBeNull()
    } finally {
      handle.dispose()
      container.remove()
    }
  })
})
