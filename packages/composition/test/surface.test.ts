/**
 * Surface Blocks: a Block shows a Surface's feature with params its props
 * give; the page's Surface Blocks read as one Projection keyed by node.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { Block, Catalog, Composition, Content, Region } from '../src/index.js'
import { SurfaceBlock } from '../src/surface/index.js'

const Model = Schema.Struct({ greeting: Schema.String, page: Composition.Document })
type Model = typeof Model.Type
const App = Surface.application({ Model, Message: defineMessageUnion({ Noted: {} }) })
const Greeting = App.surface('Greeting', {
  params: { name: Schema.String },
  model: ({ model }) => ({ greeting: model.greeting }),
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
    expect(reads?.read(model)).toEqual({ a: { greeting: 'Hi' } })
    expect(Hello.value(reads?.read(model)['a'])).toEqual({ greeting: 'Hi' })
    expect(Hello.value(undefined)).toBeUndefined()
  })

  it('is active while there is a page with one, as its application’s', () => {
    const active = SurfaceBlock.active('Features', App.owner, Site, (model: Model) => model.page)
    expect(active.owner).toBe(App.owner)
    expect(active.projectionOf({ greeting: 'Hi', page: page({}) })).toBeUndefined()
    expect(
      active.projectionOf({ greeting: 'Hi', page: page({ a: { name: 'Ada' } }) }),
    ).toBeDefined()
  })
})
