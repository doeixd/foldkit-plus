/**
 * What an edit costs on a large page (pagebuilder-DESIGN §25).
 *
 * A Document of 1,000 nodes: 50 sections of 19 blocks each, a Hero among them
 * holding buttons. The budgets are one `setProp` or `move` under 1 ms,
 * `validate` of the whole page under 10 ms, and `index` under 5 ms. The
 * numbers are recorded in the package README and the design.
 */
import { Result, Schema } from 'effect'
import { describe, test } from 'vitest'
import { Block, Catalog, Composition, Content, NodeId, Region } from 'foldkit-composition'

// Vitest 5 hands `bench` to a test as a context fixture; this keeps each case one line.
const benchmark = (name: string, run: () => unknown) =>
  test(name, async ({ bench }) => {
    await bench(name, run).run()
  })

const Heading = Block.define('Heading', {
  Props: Schema.Struct({ text: Schema.String }),
  provides: [Content.Flow],
})
const Button = Block.define('Button', {
  Props: Schema.Struct({ label: Schema.String }),
  provides: [Content.Flow, Content.Interactive],
})
const Section = Block.define('Section', {
  Props: Schema.Struct({}),
  regions: { body: Region.many({ accepts: [Content.Flow] }) },
  provides: [Content.Section],
})
const Site = Catalog.make({ blocks: [Heading, Button, Section], roots: [Content.Section] })

const id = NodeId.make
const sections = 50
const perSection = 19
const nodes: Record<string, unknown> = {}
const roots: Array<string> = []
for (let s = 0; s < sections; s++) {
  const children = Array.from({ length: perSection }, (_, c) => `n${s}-${c}`)
  roots.push(`s${s}`)
  nodes[`s${s}`] = { block: 'Section', props: {}, regions: { body: children } }
  children.forEach((child, c) => {
    nodes[child] =
      c % 3 === 0
        ? { block: 'Button', props: { label: `b${c}` }, regions: {} }
        : { block: 'Heading', props: { text: `h${c}` }, regions: {} }
  })
}
const page = Schema.decodeUnknownSync(Composition.Document)({ format: 1, roots, nodes })
if (Object.keys(page.nodes).length !== sections * (perSection + 1))
  throw new Error('not 1,000 nodes')

const setProp = Composition.Op.setProp(id('n25-4'), 'text', 'Edited')
const move = Composition.Op.move(id('n25-4'), Composition.region(id('s40'), 'body', 3))

describe('a 1,000-node page', () => {
  benchmark('apply one setProp', () => Result.getOrThrow(Composition.apply(Site, page, setProp)))
  benchmark('apply one move between sections', () =>
    Result.getOrThrow(Composition.apply(Site, page, move)),
  )
  benchmark('validate the whole page', () => Composition.validate(Site, page))
  // A fresh Document value each time, so the memo does not answer.
  benchmark('index a page not seen before', () => Composition.index({ ...page }))
})
