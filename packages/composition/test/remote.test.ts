/**
 * Query Blocks: a Block names a query and says how its props become the
 * query's input; the page's reads are one Projection over the Model, keyed by
 * node, which Remote fetches like any other; a Renderer hands each node its
 * rows, typed by what the Block selects.
 */
import { Effect, Layer, Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { inertHtml, type Html } from 'foldkit/html'
import { Entity, Query, Remote, RemoteClient, type Page, type RemoteData } from 'foldkit-remote'
import { Surface } from 'foldkit-surface'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { Block, Catalog, Composition, Content, Region } from '../src/index.js'
import { Renderer } from '../src/foldkit/index.js'
import { QueryBlock } from '../src/remote/index.js'

const Project = Entity.make('Project', Schema.Struct({ id: Schema.String, name: Schema.String }))
const ProjectsByOwner = Query.make('ProjectsByOwner', {
  Input: { ownerId: Schema.String },
  Result: Project,
})

const Model = Schema.Struct({ remote: Remote.Model })
type Model = typeof Model.Type
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const Data = Remote.make({
  model: App.model.remote,
  entities: [Project],
  queries: [ProjectsByOwner],
})
const initial: Model = { remote: Remote.initial }

/** An author picks whose projects and how many; the Block turns that into the query. */
const Projects = QueryBlock.define('Projects', {
  Props: Schema.Struct({ owner: Schema.String, count: Schema.Literals([2, 3]) }),
  provides: [Content.Flow],
  query: ProjectsByOwner,
  input: props => ({ ownerId: props.owner }),
  select: Project.select({ name: true }),
  first: props => props.count,
})
const Section = Block.define('Section', {
  Props: Schema.Struct({}),
  regions: { body: Region.many({ accepts: [Content.Flow] }) },
  provides: [Content.Section],
})
const Site = Catalog.make({ blocks: [Section, Projects], roots: [Content.Section] })

const SiteRenderer = Renderer.make(Site, {
  Section: ({ regions, h }) => h.section([], [...regions.body]),
  Projects: ({ data, h }) => {
    const rows = Projects.rows(data)
    return rows._tag === 'Ready'
      ? h.ul(
          [],
          rows.value.items.map(item => h.li([], [item.name])),
        )
      : h.p([], ['Loading'])
  },
})

const page = Schema.decodeUnknownSync(Composition.Document)({
  format: 1,
  roots: ['s'],
  nodes: {
    s: { block: 'Section', props: {}, regions: { body: ['mine', 'broken'] } },
    mine: { block: 'Projects', props: { owner: 'u1', count: 2 }, regions: {} },
    // Props that do not decode read nothing.
    broken: { block: 'Projects', props: { owner: 'u1', count: 9 }, regions: {} },
  },
})

/** A server holding three of u1's projects. */
const server = () => {
  const asked: Array<{ readonly input: unknown; readonly first: number | undefined }> = []
  const layer = Layer.succeed(RemoteClient, {
    read: batch =>
      Effect.succeed({
        settled: [],
        entities: batch.requests.map(request => ({
          entity: request.entity,
          id: request.id,
          values: { name: `Project ${request.id}` },
        })),
      }),
    query: request => {
      asked.push({ input: request.input, first: request.window.first })
      const ids = ['p1', 'p2', 'p3'].slice(0, request.window.first ?? 3)
      return Effect.succeed({
        edges: ids.map(id => ({ entity: 'Project', id, key: `Project:${id}` })),
        start: { _tag: 'Terminal' },
        end: { _tag: 'Terminal' },
      })
    },
    mutate: () => Effect.die('unused'),
    live: () => Stream.empty,
  })
  return { asked, layer }
}

const text = (nodes: ReadonlyArray<Html>): string =>
  nodes
    .map(node =>
      node === null
        ? ''
        : `${node.text ?? ''}${text((node.children ?? []).filter(child => typeof child !== 'string'))}`,
    )
    .join('')

describe('a Query Block', () => {
  it('reads the page’s Query Blocks as one Projection, which Remote fetches', async () => {
    const reads = QueryBlock.reads(Data, Site, page)
    if (reads === undefined) throw new Error('no reads')
    expect(reads.read(initial)).toEqual({ mine: { _tag: 'Initial' } })
    const { asked, layer } = server()
    const loaded = await Effect.runPromise(
      Data.prefetch(initial, reads).pipe(Effect.provide(layer)),
    )
    expect(asked).toEqual([{ input: { ownerId: 'u1' }, first: 2 }])
    expect(reads.read(loaded)).toEqual({
      mine: {
        _tag: 'Ready',
        value: {
          items: [{ name: 'Project p1' }, { name: 'Project p2' }],
          hasNext: false,
          hasPrevious: false,
        },
      },
    })
  })

  it('draws a node’s rows from the data it is handed, and waits without them', async () => {
    const reads = QueryBlock.reads(Data, Site, page)
    if (reads === undefined) throw new Error('no reads')
    const loaded = await Effect.runPromise(
      Data.prefetch(initial, reads).pipe(Effect.provide(server().layer)),
    )
    expect(text(Renderer.render(SiteRenderer, page, inertHtml, { data: reads.read(loaded) }))).toBe(
      'Project p1Project p2',
    )
    expect(text(Renderer.render(SiteRenderer, page, inertHtml))).toBe('Loading')
  })

  it('reads nothing on a page with no Query Block', () => {
    const empty = Schema.decodeUnknownSync(Composition.Document)({
      format: 1,
      roots: ['s'],
      nodes: { s: { block: 'Section', props: {}, regions: { body: [] } } },
    })
    expect(QueryBlock.reads(Data, Site, empty)).toBeUndefined()
  })

  it('types its rows by what it selects', () => {
    expectTypeOf(Projects.rows).returns.toEqualTypeOf<RemoteData<Page<{ readonly name: string }>>>()
    expectTypeOf(Projects.name).toEqualTypeOf<'Projects'>()
  })
})
