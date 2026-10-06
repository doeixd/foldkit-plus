/**
 * `SurfaceBlock.families`: a page's Surface Blocks as one family per Block
 * for Remote and SSR, keyed by node id — so fetching, retention, and
 * coverage follow the Document, draft edits included.
 */
import { Effect, Layer, Option, Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Entity, Remote, RemoteClient } from 'foldkit-remote'
import { Projection, Surface, type SurfaceSource } from 'foldkit-surface'
import { SSR } from 'foldkit-ssr'
import { describe, expect, it } from 'vitest'
import { Block, Catalog, Composition, Content, Region } from '../src/index.js'
import type { Document } from '../src/document.js'
import { SurfaceBlock } from '../src/surface/index.js'

const Model = Schema.Struct({ page: Composition.Document, remote: Remote.Model })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Remote.messages })
const initial: Model = { page: Composition.empty(), remote: Remote.initial }
const App = Surface.application({ Model, Message, initial, update: (model: Model) => ({ model }) })

const User = Entity.make('User', Schema.Struct({ id: Schema.String, name: Schema.String }))
const Data = Remote.make({ model: App.model.remote, entities: [User] })

const Greeter = App.surface('Greeter', {
  params: { id: Schema.String },
  model: ({ params }) => ({ user: Data.get(User.select({ name: true }), params.id) }),
  messages: [],
})
const Hello = SurfaceBlock.define('Hello', {
  Props: Schema.Struct({ id: Schema.String }),
  provides: [Content.Flow],
  surface: Greeter,
  params: props => ({ id: props.id }),
})
/** The same Surface under another Block: its nodes must not join Hello's family. */
const Hola = SurfaceBlock.define('Hola', {
  Props: Schema.Struct({ id: Schema.String }),
  provides: [Content.Flow],
  surface: Greeter,
  params: props => ({ id: props.id }),
})
const Section = Block.define('Section', {
  Props: Schema.Struct({}),
  regions: { body: Region.many({ accepts: [Content.Flow] }) },
  provides: [Content.Section],
})
const Site = Catalog.make({ blocks: [Section, Hello, Hola], roots: [Content.Section] })

const page = (nodes: Readonly<Record<string, { block: string; props: unknown }>>) =>
  Schema.decodeUnknownSync(Composition.Document)({
    format: 1,
    roots: ['s'],
    nodes: {
      s: { block: 'Section', props: {}, regions: { body: Object.keys(nodes) } },
      ...Object.fromEntries(
        Object.entries(nodes).map(([id, node]) => [id, { ...node, regions: {} }]),
      ),
    },
  })

const Page = App.surface('Page', {
  model: ({ model }) => Projection.struct({ page: model.page }),
})
const pageAt = Surface.at(Page, undefined)
const families = SurfaceBlock.families(Site, {
  from: pageAt,
  document: ({ page }) => page,
})
const hello = (model: Model) => Surface.instances(families['Hello'] as SurfaceSource<Model>, model)

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
          values: { name: `name of ${request.id}` },
        })),
      })
    },
    query: () => Effect.die('unused'),
    mutate: () => Effect.die('unused'),
    live: () => Stream.empty,
  })
  return { reads, layer }
}

describe('SurfaceBlock.families', () => {
  it('is one family per Surface Block, each instance keyed by node id', () => {
    expect(Object.keys(families)).toEqual(['Hello', 'Hola'])
    const model: Model = {
      page: page({ a: { block: 'Hello', props: { id: 'u1' } } }),
      remote: Remote.initial,
    }
    const instances = hello(model)
    expect(instances.map(instance => [instance.key, instance.params])).toEqual([
      ['a', { id: 'u1' }],
    ])
    expect(instances[0]?.surface.name).toBe('Greeter')
  })

  it('keeps one Block’s nodes out of another Block’s family', () => {
    const model: Model = {
      page: page({
        a: { block: 'Hello', props: { id: 'u1' } },
        b: { block: 'Hola', props: { id: 'u2' } },
      }),
      remote: Remote.initial,
    }
    expect(hello(model).map(instance => instance.key)).toEqual(['a'])
    expect(
      Surface.instances(families['Hola'] as SurfaceSource<Model>, model).map(
        instance => instance.key,
      ),
    ).toEqual(['b'])
  })

  it('skips nodes whose props do not decode, unknown Blocks, and Blocks without a Surface', () => {
    const model: Model = {
      page: page({
        a: { block: 'Hello', props: { id: 'u1' } },
        b: { block: 'Hello', props: { id: 7 } },
        c: { block: 'Nope', props: {} },
      }),
      remote: Remote.initial,
    }
    expect(hello(model).map(instance => instance.key)).toEqual(['a'])
  })

  it('resolves nothing while the parent is inactive, or without a document', () => {
    const off = SurfaceBlock.families(Site, {
      from: Surface.at(Page, () => Option.none()),
      document: ({ page }) => page,
    })
    const model: Model = {
      page: page({ a: { block: 'Hello', props: { id: 'u1' } } }),
      remote: Remote.initial,
    }
    expect(hello(model)).toHaveLength(1)
    expect(Surface.instances(off['Hello'] as SurfaceSource<Model>, model)).toEqual([])
    const nodoc = SurfaceBlock.families(Site, {
      from: pageAt,
      document: () => undefined,
    })
    expect(Surface.instances(nodoc['Hello'] as SurfaceSource<Model>, model)).toEqual([])
  })

  it('refuses a Surface of another application', () => {
    const Other = Surface.application({ Model, Message })
    const Stranger = SurfaceBlock.define('Stranger', {
      Props: Schema.Struct({}),
      provides: [Content.Flow],
      surface: Other.surface('Elsewhere', { model: () => ({}) }),
      params: () => undefined,
    })
    const Mixed = Catalog.make({ blocks: [Section, Stranger], roots: [Content.Section] })
    expect(() =>
      SurfaceBlock.families(Mixed, { from: pageAt, document: ({ page }) => page }),
    ).toThrow('"Elsewhere" belongs to another application than "Page"')
  })
})

describe('Fetching and coverage follow the Document', () => {
  const at = (document: Document): Model => ({ page: document, remote: Remote.initial })

  it('asks for what the draft names, and stops asking for what it no longer names', async () => {
    const client = recording()
    const entries = Data.subscriptions({ ...families })
    const asked = (model: Model) =>
      entries['Hello.read']!.modelToDependencies(model).requirements.map(r => `${r.entity}:${r.id}`)
    const first = page({ a: { block: 'Hello', props: { id: 'u1' } } })
    expect(asked(at(first))).toEqual(['User:u1'])
    // The author replaces the node: the family follows the draft, not the fetch.
    const second = page({ b: { block: 'Hello', props: { id: 'u2' } } })
    expect(asked(at(second))).toEqual(['User:u2'])
    const loaded = await Effect.runPromise(
      Data.satisfy(at(second), { ...families }).pipe(Effect.provide(client.layer)),
    )
    expect(client.reads).toEqual([['User:u2']])
    expect(
      entries.retain.modelToDependencies(loaded).requirements.map(r => `${r.entity}:${r.id}`),
    ).toEqual(['User:u2'])
  })

  it('covers each node instance, and carries it in the envelope', async () => {
    const client = recording()
    const document = page({ a: { block: 'Hello', props: { id: 'u1' } } })
    const loaded = await Effect.runPromise(
      Data.satisfy(at(document), { Hello: families['Hello'] as SurfaceSource<Model> }).pipe(
        Effect.provide(client.layer),
      ),
    )
    const layout = SSR.plan(App, {
      id: 'page',
      state: Projection.pick(App.model.page),
      surfaces: [families['Hello'] as SurfaceSource<Model>],
      parts: [Remote.resume(Data)],
    })
    expect(SSR.inspect(layout, loaded).surfaces).toMatchObject([
      { name: 'Page', active: true },
      { name: 'Greeter', key: 'a', via: { surface: 'Page' } },
    ])
    const body = JSON.parse(SSR.envelope(layout, loaded))
    expect(Object.keys(body.parts.remote.entities)).toEqual(['User:u1'])
  })
})
