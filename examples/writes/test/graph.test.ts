// @vitest-environment node
/**
 * The declared writes in the Module graph (#537): each write that can break a
 * law is `law-unwitnessed` until a check, a walk or a line says it keeps it.
 */
import { Schema } from 'effect'
import { Entity, Expr, Write } from 'foldkit-entity'
import { Laws } from 'foldkit-entity/laws'
import { Mutation, Remote } from 'foldkit-remote'
import { Evidence, Graph, GraphNode, Module, Surface } from 'foldkit-surface'
import { beforeAll, describe, expect, it } from 'vitest'
import { Product, Publish, Rename, Restock, Revert, Sell } from '../src/domain.js'
import { report } from '../src/laws.js'
import { Shop, enumerated, reverted, walked } from './shop.js'

let walk: ReadonlyArray<Evidence> = []
beforeAll(async () => {
  walk = await walked()
}, 60_000)

/** Each unwitnessed pair, as `transition x law`. */
const unwitnessed = (evidence: ReadonlyArray<Evidence>) =>
  Graph.validate(Shop, { evidence })
    .filter(finding => finding.rule === 'law-unwitnessed')
    .map(finding => finding.message.replace(/^(\S+) writes .*, which (\S+) reads.*$/, '$1 x $2'))

describe('the declared writes in the Module graph', () => {
  it('hold a transition for each write Laws.check judges', () => {
    expect(
      Graph.of(Shop)
        .nodes.filter(GraphNode.$is('Transition'))
        .map(node => node.id),
    ).toEqual([...new Set(report.pairs.map(pair => Laws.transition({ name: pair.write })))])
  })

  it('report Sell x reservedWithinStock, among each write that can break a law, until evidence keeps it', () => {
    // A transition invariant reads the whole row, so every write to it can break it.
    expect(unwitnessed([])).toEqual([
      'write:Restock x Product.reservedWithinStock',
      'write:Sell x Product.reservedWithinStock',
      'write:Publish x Product.publishedStaysPublished',
      'write:Rename x Product.publishedStaysPublished',
      'write:Restock x Product.publishedStaysPublished',
      'write:Revert x Product.publishedStaysPublished',
      'write:Sell x Product.publishedStaysPublished',
    ])
    expect(unwitnessed(enumerated)).toEqual([
      'write:Restock x Product.reservedWithinStock',
      'write:Sell x Product.reservedWithinStock',
      'write:Revert x Product.publishedStaysPublished',
    ])
  })

  it('stop for Sell and Restock once the walk’s records are passed, and for Revert with its line', () => {
    expect(unwitnessed([...enumerated, ...walk])).toEqual([
      'write:Revert x Product.publishedStaysPublished',
    ])
    expect(Graph.validate(Shop, { evidence: [...enumerated, ...walk, reverted] })).toEqual([])
  })

  it('answer what can make reserved exceed stock: Sell and Restock, and their walk', () => {
    const graph = Graph.of(Shop, { evidence: [...enumerated, ...walk] })
    const breakers = Graph.breakersOf(graph, 'Product.reservedWithinStock')
    expect(breakers.map(breaker => [breaker.transition, breaker.paths])).toEqual([
      ['write:Restock', [['Product', 'stock']]],
      ['write:Sell', [['Product', 'stock']]],
    ])
    expect(breakers.map(breaker => breaker.evidence.map(record => record._tag))).toEqual([
      ['Walked'],
      ['Walked'],
    ])
  })

  it('refuse a record typed by hand, and one naming a law no contract declares', () => {
    const typed = Evidence.Walked({
      transition: 'write:Sell',
      law: 'Product.reservedWithinStock',
      seeds: 12,
      steps: 15,
      starts: ['stocked'],
    })
    const stranger = Evidence.runtimeOnly({
      transition: 'write:Sell',
      law: 'Order.paidOnce',
      why: 'a law nothing declares',
    })
    const findings = Graph.validate(Shop, {
      evidence: [...enumerated, ...walk, reverted, typed, stranger],
    })
    expect(findings.map(finding => finding.rule)).toEqual([
      'evidence-unmatched',
      'evidence-unmatched',
    ])
  })
})

describe('a second Entity beside the products', () => {
  const OrderFields = Entity.define(
    'Order',
    Schema.Struct({ id: Schema.String, paid: Schema.Number }),
  )
  const paidOnce = Entity.invariant<typeof OrderFields>(
    'paidOnce',
    ({ after }) => Expr.lte(after.paid, 1),
    { message: 'An order is paid once', path: ['paid'] },
  )
  const Order = OrderFields.pipe(paidOnce)
  const Pay = Mutation.write(
    'Pay',
    Write.update(Entity.input(Order, Schema.Struct({ id: Schema.String, paid: Schema.Number })), {
      id: 'id',
    }),
  )
  const App = Surface.application({
    Model: Schema.Struct({ remote: Remote.Model }),
    Message: Remote.Message,
  })
  const Orders = Module.make(App, [
    Remote.make({
      model: App.model.remote,
      entities: [Product, Order],
      mutations: [Publish, Rename, Restock, Revert, Sell, Pay],
    }),
  ])
  const crossed = (transition: string, law: string) =>
    Evidence.runtimeOnly({ transition, law, why: 'the other Entity’s pair' })

  it('refuse a record joining a write of one Entity to a law of the other, both declared', () => {
    const findings = Graph.validate(Orders, {
      evidence: [
        crossed('write:Sell', Laws.law(paidOnce)),
        crossed('write:Pay', 'Product.reservedWithinStock'),
        crossed('write:Pay', Laws.law(paidOnce)),
      ],
    }).filter(finding => finding.rule === 'evidence-unmatched')
    expect(findings.map(finding => finding.message)).toEqual([
      'Evidence that write:Sell keeps Order.paidOnce names a pair the graph does not join: write:Sell writes nothing beside what Order.paidOnce reads',
      'Evidence that write:Pay keeps Product.reservedWithinStock names a pair the graph does not join: write:Pay writes nothing beside what Product.reservedWithinStock reads',
    ])
  })
})
