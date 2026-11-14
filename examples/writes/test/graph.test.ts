// @vitest-environment node
/**
 * The declared writes in the Module graph (#537): each write that can break a
 * law is `law-unwitnessed` until a check, a walk or a line says it keeps it.
 */
import { Laws } from 'foldkit-entity'
import { Evidence, Graph, GraphNode, Module } from 'foldkit-surface'
import { beforeAll, describe, expect, it } from 'vitest'
import { report } from '../src/laws.js'
import { Shop, enumerated, reverted, walked } from './shop.js'

let walk: ReadonlyArray<Evidence> = []
beforeAll(async () => {
  walk = await walked()
}, 60_000)

/** Each unwitnessed pair, as `transition x law`. */
const unwitnessed = (evidence: ReadonlyArray<Evidence>) =>
  Module.validate(Shop, { evidence })
    .filter(finding => finding.rule === 'law-unwitnessed')
    .map(finding => finding.message.replace(/^(\S+) writes .*, which (\S+) reads.*$/, '$1 x $2'))

describe('the declared writes in the Module graph', () => {
  it('hold a transition for each write Laws.check judges', () => {
    expect(
      Module.graph(Shop)
        .nodes.filter(GraphNode.$is('Transition'))
        .map(node => node.id),
    ).toEqual([...new Set(report.pairs.map(pair => Laws.transition({ name: pair.write })))])
  })

  it('report Sell x reservedWithinStock, among each write that can break a law, until evidence keeps it', () => {
    expect(unwitnessed([])).toEqual([
      'write:Restock x Product.reservedWithinStock',
      'write:Sell x Product.reservedWithinStock',
      'write:Publish x Product.publishedStaysPublished',
      'write:Revert x Product.publishedStaysPublished',
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
    expect(Module.validate(Shop, { evidence: [...enumerated, ...walk, reverted] })).toEqual([])
  })

  it('answer what can make reserved exceed stock: Sell and Restock, and their walk', () => {
    const graph = Module.graph(Shop, { evidence: [...enumerated, ...walk] })
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

  it('refuse a record typed by hand, and one naming a law the domain does not declare', () => {
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
      why: 'another Entity’s law',
    })
    const findings = Module.validate(Shop, {
      evidence: [...enumerated, ...walk, reverted, typed, stranger],
    })
    expect(findings.map(finding => finding.rule)).toEqual([
      'evidence-unmatched',
      'evidence-unmatched',
    ])
  })
})
