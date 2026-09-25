/**
 * Surface Blocks: a Block shows a Surface's feature with params its props
 * give; the page's Surface Blocks read as one Projection keyed by node.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Projection, Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { Block, Catalog, Composition, Content, Region } from '../src/index.js'
import { SurfaceBlock } from '../src/surface/index.js'

const Model = Schema.Struct({ greeting: Schema.String, page: Composition.Document })
type Model = typeof Model.Type
const Message = defineMessageUnion({ Noted: {} })
const App = Surface.application({ Model, Message })
/** A greeting to whoever the node names: its params reach what it reads. */
const Greeting = App.surface('Greeting', {
  params: { name: Schema.String },
  model: ({ model, params }) => ({
    greeting: model.greeting,
    to: Projection.fromReader(Schema.String, () => params.name),
  }),
  messages: [Message.Noted],
})
const Hello = SurfaceBlock.define('Hello', {
  Props: Schema.Struct({ name: Schema.String }),
  provides: [Content.Flow],
  surface: Greeting,
  params: props => ({ name: props.name }),
})
const Section = Block.define('Section', {
  Props: Schema.Struct({}),
  regions: { body: Region.many({ accepts: [Content.Flow] }) },
  provides: [Content.Section],
})
const Site = Catalog.make({ blocks: [Section, Hello], roots: [Content.Section] })
const page = (body: Readonly<Record<string, unknown>>) =>
  Schema.decodeUnknownSync(Composition.Document)({
    format: 1,
    roots: ['s'],
    nodes: {
      s: { block: 'Section', props: {}, regions: { body: Object.keys(body) } },
      ...Object.fromEntries(
        Object.entries(body).map(([id, props]) => [id, { block: 'Hello', props, regions: {} }]),
      ),
    },
  })

describe('a Surface Block', () => {
  it('reads its Surface for each node, skipping one whose props do not decode', () => {
    const document = page({ a: { name: 'Ada' }, b: { name: 7 } })
    const model: Model = { greeting: 'Hi', page: document }
    const reads = SurfaceBlock.reads<Model>(Site, document)
    expect(reads?.read(model)).toEqual({ a: { greeting: 'Hi', to: 'Ada' } })
    expect(Hello.value(reads?.read(model)['a'])).toEqual({ greeting: 'Hi', to: 'Ada' })
    expect(Hello.value(undefined)).toBeUndefined()
  })

  it('is active while there is a page with one, may send what its Surfaces list, once per page', () => {
    const active = SurfaceBlock.active('Features', App.owner, Site, (model: Model) => model.page)
    expect(active.owner).toBe(App.owner)
    expect(active.messages).toEqual(['Noted'])
    expect(active.projectionOf({ greeting: 'Hi', page: page({}) })).toBeUndefined()
    const document = page({ a: { name: 'Ada' } })
    const first = active.projectionOf({ greeting: 'Hi', page: document })
    expect(first?.read({ greeting: 'Hi', page: document })).toEqual({
      a: { greeting: 'Hi', to: 'Ada' },
    })
    // Another Model with the same page reads through the same Projection.
    expect(active.projectionOf({ greeting: 'Hello', page: document })).toBe(first)
  })

  it('refuses a Surface of another application', () => {
    const Other = Surface.application({ Model, Message })
    const Stranger = SurfaceBlock.define('Stranger', {
      Props: Schema.Struct({}),
      provides: [Content.Flow],
      surface: Other.surface('Elsewhere', { model: ({ model }) => ({ greeting: model.greeting }) }),
      params: () => undefined,
    })
    const Mixed = Catalog.make({ blocks: [Section, Stranger], roots: [Content.Section] })
    expect(() =>
      SurfaceBlock.active('Features', App.owner, Mixed, (model: Model) => model.page),
    ).toThrow('"Elsewhere" belongs to another application than "Features"')
  })
})
