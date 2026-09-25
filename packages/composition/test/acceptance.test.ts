/**
 * Phase 9's acceptance page: a static Block, a Query Block, a Surface Block and
 * a stateful Block on one page, served by foldkit-ssr. The Query Block's read is
 * an active Surface of the plan, so Remote.resume carries exactly what it
 * selected; the Surface Block shows a feature's Surface; the stateful Block's
 * item is ordinary browser state; the static Block is drawn.
 */
import { Effect, Layer, Schema, Stream } from 'effect'
import { Bundle } from 'foldkit-bundle'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Submodel from 'foldkit/submodel'
import { Entity, Query, Remote, RemoteClient } from 'foldkit-remote'
import { SSR } from 'foldkit-ssr'
import { Projection, Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { Block, Catalog, Composition, Content, Region, type Document } from '../src/index.js'
import { Renderer, Stateful } from '../src/foldkit/index.js'
import { QueryBlock } from '../src/remote/index.js'
import { SurfaceBlock } from '../src/surface/index.js'

const Project = Entity.make(
  'Project',
  Schema.Struct({ id: Schema.String, name: Schema.String, budget: Schema.Number }),
)
const ProjectsByOwner = Query.make('ProjectsByOwner', {
  Input: { ownerId: Schema.String },
  Result: Project,
})

const CounterModel = Schema.Struct({ count: Schema.Number })
const CounterMessage = defineMessageUnion({ Incremented: {} })
const Counter = Bundle.make('Counter', {
  Model: CounterModel,
  Message: CounterMessage,
  init: () => ({ model: { count: 0 } }),
  update: model => ({ model: { count: model.count + 1 } }),
  view: Submodel.defineView<typeof CounterModel.Type, typeof CounterMessage.Type>((model, h) =>
    h.button([h.OnClick(CounterMessage.Incremented())], [`Votes: ${model.count}`]),
  ),
})

const Section = Block.define('Section', {
  Props: Schema.Struct({}),
  regions: { body: Region.many({ accepts: [Content.Flow] }) },
  provides: [Content.Section],
})
const Heading = Block.define('Heading', {
  Props: Schema.Struct({ text: Schema.String }),
  provides: [Content.Flow],
})
const Projects = QueryBlock.define('Projects', {
  Props: Schema.Struct({ owner: Schema.String }),
  provides: [Content.Flow],
  query: ProjectsByOwner,
  input: props => ({ ownerId: props.owner }),
  select: Project.select({ name: true }),
  first: () => 2,
})
const Votes = Block.define('Votes', {
  Props: Schema.Struct({ start: Schema.Number }),
  provides: [Content.Flow],
  stateful: true,
})

const VotesDeclared = Bundle.declareEach(Counter, 'votes')
const Model = Schema.Struct({
  page: Composition.Document,
  remote: Remote.Model,
  cartCount: Schema.Number,
  ...VotesDeclared.fields,
})
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Remote.messages, ...VotesDeclared.cases })
type Message = typeof Message.Type
const Page = Bundle.parent({ Model, Message })
const Placed = Page.each(VotesDeclared)
const initial: Model = {
  page: Composition.empty(),
  remote: Remote.initial,
  cartCount: 2,
  votes: {},
}
const App = Surface.application({ Model, Message, initial, update: model => ({ model }) })

/** A feature the page shows where an author puts it: the cart, captioned as the node says. */
const CartSummary = App.surface('CartSummary', {
  params: { caption: Schema.String },
  model: ({ model, params }) => ({
    count: model.cartCount,
    caption: Projection.fromReader(Schema.String, () => params.caption),
  }),
})
const Cart = SurfaceBlock.define('Cart', {
  Props: Schema.Struct({ caption: Schema.String }),
  provides: [Content.Flow],
  surface: CartSummary,
  params: props => ({ caption: props.caption }),
})
const Site = Catalog.make({
  blocks: [Section, Heading, Projects, Cart, Votes],
  roots: [Content.Section],
})
const Data = Remote.make({
  model: App.model.remote,
  entities: [Project],
  queries: [ProjectsByOwner],
})

const home: Document = Schema.decodeUnknownSync(Composition.Document)({
  format: 1,
  roots: ['s'],
  nodes: {
    s: { block: 'Section', props: {}, regions: { body: ['title', 'list', 'cart', 'poll'] } },
    title: { block: 'Heading', props: { text: 'Our work' }, regions: {} },
    list: { block: 'Projects', props: { owner: 'u1' }, regions: {} },
    cart: { block: 'Cart', props: { caption: 'In your cart' }, regions: {} },
    poll: { block: 'Votes', props: { start: 4 }, regions: {} },
  },
})

const SiteRenderer = Renderer.forMessages<Message>().make(Site, {
  Section: ({ regions, h }) => h.section([], [...regions.body]),
  Heading: ({ props, h }) => h.h1([], [props.text]),
  Projects: ({ data, h }) => {
    const rows = Projects.rows(data)
    return rows._tag === 'Ready'
      ? h.ul(
          [],
          rows.value.items.map(row => h.li([], [row.name])),
        )
      : h.p([], ['Loading'])
  },
  Cart: ({ data, h }) => {
    const cart = Cart.value(data)
    return h.p([], [cart === undefined ? '' : `${cart.caption}: ${cart.count}`])
  },
  Votes: ({ data }) => Stateful.html(data),
})

const reads = QueryBlock.active('PageReads', App.owner, Data, Site, (model: Model) => model.page)
const features = SurfaceBlock.active('PageFeatures', App.owner, Site, (model: Model) => model.page)

/** The server's store: two of u1's projects, with a budget no Block selects. */
const server = Layer.succeed(RemoteClient, {
  read: batch =>
    Effect.succeed({
      settled: [],
      entities: batch.requests.map(request => ({
        entity: request.entity,
        id: request.id,
        values: { name: `Project ${request.id}`, budget: 1_000_000 },
      })),
    }),
  query: () =>
    Effect.succeed({
      edges: ['p1', 'p2'].map(id => ({ entity: 'Project', id, key: `Project:${id}` })),
      start: { _tag: 'Terminal' },
      end: { _tag: 'Terminal' },
    }),
  mutate: () => Effect.die('unused'),
  live: () => Stream.empty,
})

describe('a page of static, data, feature and stateful Blocks, served by SSR', () => {
  it('draws all four, and sends the browser the read and the state, not the store', async () => {
    const withPage: Model = Stateful.sync(
      Placed,
      Site,
      Votes,
      { before: undefined, after: home },
      (counter, props) => ({
        ...counter,
        count: props.start,
      }),
    )({ ...initial, page: home }).model
    const projection = reads.projectionOf(withPage)
    if (projection === undefined) throw new Error('no reads')
    const loaded = await Effect.runPromise(
      Data.prefetch(withPage, projection).pipe(Effect.provide(server)),
    )
    const update = Page.assemble(Placed).update()
    const config = {
      Model,
      init: () => ({ model: loaded }),
      update: (model: Model, message: Message) => update(model, message),
      view: (model: Model, h: HtmlBuilder<Message>) => ({
        title: 'Home',
        body: h.main(
          [],
          Renderer.render(SiteRenderer, model.page, h, {
            data: {
              ...(reads.projectionOf(model)?.read(model) ?? {}),
              ...(features.projectionOf(model)?.read(model) ?? {}),
              ...Stateful.views(Placed, Site, Votes, model.page, model, h),
            },
          }),
        ),
      }),
      container: null,
    }
    const plan = SSR.plan(App, {
      id: 'home',
      state: Projection.pick(App.model.page, App.model.votes, App.model.cartCount),
      surfaces: [reads, features],
      parts: [Remote.resume(Data)],
    })
    const result = await Effect.runPromise(SSR.render(config, plan, { buildId: 'b' }))
    const html = SSR.page(
      '<!doctype html><html><head><title></title></head><body><div id="root"></div></body></html>',
      result,
    )
    for (const drawn of ['Our work', 'Project p1', 'Project p2', 'In your cart: 2', 'Votes: 4'])
      expect(html).toContain(drawn)
    // The read crosses as what it selected; the store's other fields do not.
    expect(result.envelope).toContain('Project p1')
    expect(result.envelope).not.toContain('1000000')
  })
})
