/**
 * router-DESIGN §31 step 2: Remote follows `SurfaceSource`s, not just lone
 * Surfaces.
 *
 * A page reads its document, and the document reveals a card per id: the
 * family joins the page's requirements with its instances', `Data.satisfy`
 * reaches the instances in a later pass, and what is still reading names the
 * instance (`Cards[a]`), not just the Surface.
 */
import { Effect, Layer, Option, Schema, Stream, pipe } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import {
  defineRouteUnion,
  literal,
  mapTo,
  oneOf,
  parseUrlWithFallback,
  root,
  slash,
  string,
} from 'foldkit/route'
import { fromString } from 'foldkit/url'
import { Entity as DomainEntity, Expr, Order } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { Query, Remote, RemoteClient, RemoteUnsatisfied } from '../src/index.js'

const Page = DomainEntity.define(
  'Page',
  Schema.Struct({
    id: Schema.String,
    title: Schema.String,
    cards: Schema.Array(Schema.String),
  }),
)
const Project = DomainEntity.define(
  'Project',
  Schema.Struct({ id: Schema.String, name: Schema.String, pageId: Schema.String }),
)
const ProjectSummary = DomainEntity.select(Project, { id: true, name: true })

const CardsByPage = Query.define('CardsByPage', { pageId: Schema.String }, ({ input }) =>
  Query.from(Project).pipe(
    Query.where(Expr.eq(Project.fields.pageId, input.pageId)),
    Query.orderBy(Order.asc(Project.fields.id)),
  ),
)

const AppRoute = defineRouteUnion({
  Home: {},
  Page: { pageId: Schema.String },
  NotFound: { path: Schema.String },
})
type AppRoute = typeof AppRoute.Type

const pageRouter = pipe(literal('pages'), slash(string('pageId')), mapTo(AppRoute.Page))
const homeRouter = pipe(root, mapTo(AppRoute.Home))
const urlToRoute = parseUrlWithFallback(oneOf(pageRouter, homeRouter), AppRoute.NotFound)

const routeOf = (path: string): AppRoute => {
  const url = fromString(`https://example.test${path}`)
  if (Option.isNone(url)) throw new Error(`not a url: ${path}`)
  return urlToRoute(url.value)
}

const Model = Schema.Struct({ route: AppRoute, remote: Remote.Model })
type Model = typeof Model.Type
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const Data = Remote.make({
  model: App.model.remote,
  entities: [Page, Project],
  queries: [CardsByPage],
})

const PageView = App.surface('PageView', {
  params: { id: Schema.String },
  model: ({ params }) => ({
    page: Data.get(DomainEntity.select(Page, { id: true, title: true, cards: true }), params.id),
  }),
})
const pageAt = Surface.at(PageView, (model: Model) =>
  model.route._tag === 'Page' ? Option.some({ id: model.route.pageId }) : Option.none(),
)

const Card = App.surface('Card', {
  params: { id: Schema.String },
  model: ({ params }) => ({
    project: Data.get(DomainEntity.select(Project, { name: true }), params.id),
  }),
})

const Grid = App.surface('Grid', {
  params: { pageId: Schema.String },
  model: ({ params }) => ({
    cards: Data.query(
      CardsByPage,
      { pageId: params.pageId },
      { select: ProjectSummary, first: 10 },
    ),
  }),
})

/** One card per id the page names; nothing while the page is unread. */
const Cards = Surface.each(Card, {
  from: pageAt,
  instances: ({ page }) =>
    page._tag === 'Ready' ? page.value.cards.map(id => ({ key: id, params: { id } })) : [],
})

const Grids = Surface.each(Grid, {
  from: pageAt,
  instances: ({ page }) =>
    page._tag === 'Ready' ? [{ key: 'all', params: { pageId: page.value.id } }] : [],
})

const at = (path: string): Model => ({ route: routeOf(path), remote: Remote.initial })

/** A client that answers every read and records what it was asked. */
const recording = () => {
  const reads: Array<ReadonlyArray<string>> = []
  const layer = Layer.succeed(RemoteClient, {
    read: batch => {
      reads.push(batch.requests.map(request => `${request.entity}:${request.id}`))
      return Effect.succeed({
        settled: [],
        entities: batch.requests.map(request => ({
          entity: request.entity,
          id: request.id,
          values:
            request.entity === 'Page'
              ? { id: request.id, title: 't', cards: ['a', 'b'] }
              : { id: request.id, name: `name of ${request.id}`, pageId: 'p1' },
        })),
      })
    },
    query: () => Effect.die('unused'),
    mutate: () => Effect.die('unused'),
    live: () => Stream.empty,
  })
  return { reads, layer }
}

const requested = (
  model: Model,
  read: {
    modelToDependencies: (model: Model) => {
      requirements: ReadonlyArray<{ readonly entity: string; readonly id: string }>
    }
  },
) =>
  read
    .modelToDependencies(model)
    .requirements.map(requirement => `${requirement.entity}:${requirement.id}`)

describe('A family joins its parent with its instances', () => {
  const entries = Data.subscriptions({ cards: Cards })

  it('asks for nothing while the parent is inactive, without deriving instances', () => {
    const throwing = Surface.each(Card, {
      from: Surface.at(PageView, () => Option.none()),
      instances: () => {
        throw new Error('must not run while the parent is inactive')
      },
    })
    const idle = Data.subscriptions({ cards: throwing })
    expect(requested(at('/'), idle['cards.read'])).toEqual([])
    expect(idle.retain.modelToDependencies(at('/')).requirements).toEqual([])
  })

  it('asks for the parent alone until the parent is read', () => {
    expect(requested(at('/pages/p1'), entries['cards.read'])).toEqual(['Page:p1'])
  })

  it('asks for every instance once the parent reveals them, and retains them', async () => {
    const client = recording()
    // The parent alone: the page is read, and the cards it names are asked next.
    const mid = await Effect.runPromise(
      Data.prefetch(at('/pages/p1'), PageView.projection({ id: 'p1' })).pipe(
        Effect.provide(client.layer),
      ),
    )
    expect(requested(mid, entries['cards.read'])).toEqual(['Project:a', 'Project:b'])
    const loaded = await Effect.runPromise(
      Data.satisfy(at('/pages/p1'), { cards: Cards }).pipe(Effect.provide(client.layer)),
    )
    expect(client.reads).toEqual([['Page:p1'], ['Page:p1'], ['Project:a'], ['Project:b']])
    // Satisfied: nothing left to fetch, but retention still roots every read.
    expect(requested(loaded, entries['cards.read'])).toEqual([])
    expect(
      entries.retain
        .modelToDependencies(loaded)
        .requirements.map(requirement => `${requirement.entity}:${requirement.id}`)
        .sort(),
    ).toEqual(['Page:p1', 'Project:a', 'Project:b'])
    expect(Data.get(DomainEntity.select(Project, { name: true }), 'a').read(loaded)).toMatchObject({
      _tag: 'Ready',
    })
  })

  it('fails naming the instances still reading when the passes run out', async () => {
    const short = await Effect.runPromise(
      Effect.flip(Data.satisfy(at('/pages/p1'), { cards: Cards }, { passes: 1 })).pipe(
        Effect.provide(recording().layer),
      ),
    )
    expect(short).toEqual(new RemoteUnsatisfied({ surfaces: ['Card[a]', 'Card[b]'], passes: 1 }))
  })

  it('refuses a family of another application', () => {
    const Other = Surface.application({
      Model,
      Message: defineMessageUnion({ ...Remote.messages }),
    })
    const foreign = Other.surface('Foreign', {
      params: { id: Schema.String },
      model: ({ params }) => ({
        project: Data.get(DomainEntity.select(Project, { name: true }), params.id),
      }),
    })
    const off = Surface.each(foreign, {
      from: pageAt,
      instances: () => [{ key: 'a', params: { id: 'a' } }],
    })
    expect(() =>
      Effect.runSync(
        Data.satisfy(at('/pages/p1'), { cards: off }).pipe(Effect.provide(recording().layer)),
      ),
    ).toThrow(/belongs to another application/)
  })
})

describe('Diagnostics see instances', () => {
  const gridQuery = () =>
    Data.query(CardsByPage, { pageId: 'p1' }, { select: ProjectSummary, first: 10 })

  it('explains a connection read by a family instance', async () => {
    const loaded = await Effect.runPromise(
      Data.satisfy(at('/pages/p1'), { cards: Cards }).pipe(Effect.provide(recording().layer)),
    )
    const explained = Data.explain(loaded, gridQuery(), { surfaces: { grids: Grids } })
    expect(explained.surfaces).toEqual(['Grid[all]'])
    const dark = Data.explain(loaded, gridQuery(), {
      surfaces: { grids: Grids, page: pageAt },
    })
    expect(dark.surfaces).toEqual(['Grid[all]'])
  })

  it('carries a family query through subscriptions', async () => {
    const loaded = await Effect.runPromise(
      Data.satisfy(at('/pages/p1'), { cards: Cards }).pipe(Effect.provide(recording().layer)),
    )
    const entries = Data.subscriptions({ grids: Grids })
    const deps = entries['grids.read'].modelToDependencies(loaded)
    expect(deps.queries.map(query => query.identity)).toEqual([
      CardsByPage.ref({ pageId: 'p1' }).identity,
    ])
  })

  it('why names the instance that reads a ready card', async () => {
    const loaded = await Effect.runPromise(
      Data.satisfy(at('/pages/p1'), { cards: Cards }).pipe(Effect.provide(recording().layer)),
    )
    const said = Data.why(loaded, Data.get(DomainEntity.select(Project, { name: true }), 'a'), {
      surfaces: { cards: Cards },
    })
    expect(said).toMatchObject({ state: 'Ready', surfaces: ['Card[a]'] })
  })
})
