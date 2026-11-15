/**
 * The example as a Module: one Remote domain over the declared writes, and the
 * evidence its checks produce, for the graph that `graph.test.ts` validates and
 * `laws.test.ts` keeps in LAWS.md.
 */
import { Option, Schema } from 'effect'
import { Remote } from 'foldkit-remote'
import { Walk } from 'foldkit-remote/testing'
import { Evidence, Module, Surface } from 'foldkit-surface'
import { Product, Publish, Rename, Restock, Revert, Sell } from '../src/domain.js'
import { report } from '../src/laws.js'
import { broken, law, walk } from './walks.js'

const App = Surface.application({
  Model: Schema.Struct({ remote: Remote.Model }),
  Message: Remote.Message,
})

export const Shop = Module.make(App, [
  Remote.make({
    model: App.model.remote,
    entities: [Product],
    mutations: [Publish, Rename, Restock, Revert, Sell],
  }),
])

/** The pairs `Laws.check` kept by reading the declarations. */
export const enumerated = report.pairs.flatMap(pair => Option.toArray(pair.evidence))

/** The walk's records: Sell and Restock keep `reservedWithinStock` through the writer. */
export const walked = async () =>
  (await Walk.run({ ...walk, violations: broken, laws: [law] })).evidence

/** A revert of a published product is refused where it commits, which no walk can show kept. */
export const reverted = Evidence.runtimeOnly({
  transition: 'write:Revert',
  law: 'Product.publishedStaysPublished',
  why: 'Laws.check finds Published -> Draft refused: the writer refuses such a revert where it commits, as Invalid publishedStaysPublished',
})
