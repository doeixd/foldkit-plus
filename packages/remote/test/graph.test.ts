/**
 * A Remote domain's laws in the Module graph (#537): its contract declares
 * each declared write as written, and the graph derives what it writes, the
 * invariants of its Entity and what they read, the Entity's states, and each
 * write's declared `from` and `becomes`.
 */
import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Entity, Expr, Laws, Write } from 'foldkit-entity'
import { Graph, GraphEdge, GraphNode, Module, Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { Mutation, Remote } from '../src/index.js'

const Fields = Entity.define(
  'Product',
  Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    status: Schema.Literals(['draft', 'published']),
    stock: Schema.Number,
    reserved: Schema.Number,
  }),
)
const reservedWithinStock = Entity.invariant<typeof Fields>(
  'reservedWithinStock',
  ({ after }) => Expr.lte(after.reserved, after.stock),
  { message: 'Reserved stock cannot exceed the stock', path: ['reserved'] },
)
const Product = Fields.pipe(reservedWithinStock)
const Draft = Entity.refine(Product, 'Draft', { status: 'draft' })
const Published = Entity.refine(Product, 'Published', { status: 'published' })

const Publish = Mutation.write(
  'Publish',
  Write.update(
    Entity.input(
      Product,
      Schema.Struct({ id: Schema.String, status: Schema.Literal('published') }),
    ),
    { id: 'id', from: Draft, becomes: Published },
  ),
)
const Sell = Mutation.write(
  'Sell',
  Write.update(
    Entity.input(Product, Schema.Struct({ id: Schema.String, quantity: Schema.Int }), {
      quantity: Entity.unmapped,
    }),
    { id: 'id', increment: { stock: 'quantity' } },
  ),
)
const Rename = Mutation.write(
  'Rename',
  Write.update(Entity.input(Product, Schema.Struct({ id: Schema.String, name: Schema.String })), {
    id: 'id',
  }),
)

/** A mutation with no declared write: nothing to say of what it writes. */
const Archive = Mutation.make('Archive', { Input: { id: Schema.String }, Output: {} })

const Model = Schema.Struct({ remote: Remote.Model })
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const Data = Remote.make({
  model: App.model.remote,
  entities: [Product],
  mutations: [Archive, Publish, Sell, Rename],
})
const Shop = Module.make(App, [Data])
const law = Laws.law(reservedWithinStock)

describe('a Remote domain in the Module graph', () => {
  const graph = Module.graph(Shop)

  it('contributes a transition per declared write, none for a mutation with none, and what each writes', () => {
    expect(graph.nodes.filter(GraphNode.$is('Transition')).map(node => node.id)).toEqual([
      'write:Publish',
      'write:Sell',
      'write:Rename',
    ])
    expect(
      graph.edges
        .filter(GraphEdge.$is('Writes'))
        .map(edge => `${edge.transition} ${edge.space}:${edge.path.join('.')}`),
    ).toEqual([
      'write:Publish entity:Product.status',
      'write:Sell entity:Product.stock',
      'write:Rename entity:Product.name',
    ])
  })

  it('contributes each invariant of the Entity, what it reads, and the Entity’s states', () => {
    expect(graph.nodes.filter(GraphNode.$is('Law')).map(node => node.id)).toEqual([law])
    expect(graph.edges.filter(GraphEdge.$is('Reads')).map(edge => edge.path.join('.'))).toEqual([
      'Product.reserved',
      'Product.stock',
    ])
    expect(graph.nodes.filter(GraphNode.$is('State')).map(node => node.name)).toEqual([
      'Draft',
      'Published',
    ])
  })

  it('draws a write’s declared from and becomes', () => {
    expect(graph.edges.filter(GraphEdge.$is('From')).map(edge => ({ ...edge }))).toEqual([
      { _tag: 'From', transition: 'write:Publish', entity: 'Product', state: 'Draft' },
    ])
    expect(graph.edges.filter(GraphEdge.$is('To')).map(edge => ({ ...edge }))).toEqual([
      { _tag: 'To', transition: 'write:Publish', entity: 'Product', state: 'Published' },
    ])
  })

  it('names Sell, and Sell alone, as what can break the law, until evidence keeps it', () => {
    expect(Graph.breakersOf(graph, law).map(breaker => breaker.transition)).toEqual(['write:Sell'])
    expect(Module.validate(Shop)).toEqual([])
    expect(
      Module.validate(Shop, { evidence: [] }).map(finding => [finding.rule, ...finding.contracts]),
    ).toEqual([['law-unwitnessed', 'remote:remote']])
    const report = Laws.check({ writes: [Publish, Sell, Rename] })
    // The check's records keep the pairs it decided; Sell's, undecided over a computed stock, is not one.
    const enumerated = report.pairs.flatMap(pair => Option.toArray(pair.evidence))
    expect(Module.validate(Shop, { evidence: enumerated }).map(finding => finding.rule)).toEqual([
      'law-unwitnessed',
    ])
  })

  it('declares its writes as written, leaving their derivation to the graph', () => {
    expect(Data.contract.laws).toEqual({
      entities: [
        { name: 'Publish', write: Publish.write },
        { name: 'Sell', write: Sell.write },
        { name: 'Rename', write: Rename.write },
      ],
    })
  })

  it('contributes nothing for a domain with no declared write', () => {
    const reads = Remote.make({ model: App.model.remote, entities: [Product] })
    expect(Module.graph(Module.make(App, [reads])).nodes.filter(GraphNode.$is('Law'))).toEqual([])
  })
})

describe('a transition invariant in the Module graph', () => {
  // A law over the row's change: a write that leaves `status` alone breaks it.
  const RevisedFields = Entity.define(
    'Revised',
    Schema.Struct({ id: Schema.String, name: Schema.String, status: Schema.Literals(['a', 'b']) }),
  )
  const statusMoves = Entity.invariant<typeof RevisedFields>(
    'statusMoves',
    ({ before, after }) => Expr.not(Expr.eq(after.status, before.status)),
    { message: 'Every write moves the status', path: ['status'] },
  )
  const Revised = RevisedFields.pipe(statusMoves)
  const Retitle = Mutation.write(
    'Retitle',
    Write.update(Entity.input(Revised, Schema.Struct({ id: Schema.String, name: Schema.String })), {
      id: 'id',
    }),
  )
  const Revisions = Module.make(App, [
    Remote.make({ model: App.model.remote, entities: [Revised], mutations: [Retitle] }),
  ])

  it('is read whole, so a write leaving its members alone can break it, as Laws.check finds', () => {
    expect(Laws.check({ writes: [Retitle] }).pairs.map(pair => pair.verdict._tag)).toEqual([
      'Refused',
    ])
    expect(
      Graph.breakersOf(Module.graph(Revisions), Laws.law(statusMoves)).map(
        breaker => breaker.transition,
      ),
    ).toEqual(['write:Retitle'])
    expect(Module.validate(Revisions, { evidence: [] }).map(finding => finding.rule)).toEqual([
      'law-unwitnessed',
    ])
  })
})

describe('a delete in the Module graph', () => {
  const Remove = Mutation.write(
    'Remove',
    Write.delete(Entity.input(Product, Schema.Struct({ id: Schema.String })), { id: 'id' }),
  )
  const Removals = Module.make(App, [
    Remote.make({ model: App.model.remote, entities: [Product], mutations: [Remove] }),
  ])

  it('writes nothing, so breaks nothing, and the record Laws.check issues for it is admitted', () => {
    const evidence = Laws.check({ writes: [Remove] }).pairs.flatMap(pair =>
      Option.toArray(pair.evidence),
    )
    expect(evidence.map(record => `${record.transition} ${record.law}`)).toEqual([
      `write:Remove ${law}`,
    ])
    expect(Graph.breakersOf(Module.graph(Removals), law)).toEqual([])
    expect(Module.validate(Removals, { evidence })).toEqual([])
  })
})
