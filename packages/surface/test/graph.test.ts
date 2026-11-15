/**
 * The law half of the contract graph (#537): the laws contracts declare, the
 * levels closed Surfaces make, the evidence admitted, and the rules
 * `Graph.validate` asks over them.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Entity, Expr, Write } from 'foldkit-entity'
import { Evidence } from 'foldkit-metadata'
import { describe, expect, it } from 'vitest'
import {
  Graph,
  GraphEdge,
  GraphNode,
  Module,
  Projection,
  Surface,
  type Contract,
} from '../src/index.js'

const Model = Schema.Struct({
  todos: Schema.Array(Schema.Struct({ id: Schema.String, title: Schema.String })),
  filter: Schema.String,
  remote: Schema.Struct({ entities: Schema.Unknown }),
})
const Message = defineMessageUnion({
  CreatedTodo: { id: Schema.String, title: Schema.String },
  RemovedTodo: { id: Schema.String },
  ChangedFilter: { filter: Schema.String },
})
const App = Surface.application({ Model, Message })

/** A document of todos with one law over them, as `Sync.forApplication(App).make` declares it. */
const document: Contract = {
  kind: 'sync',
  name: 'todos',
  owner: App.owner,
  owns: [['todos']],
  observes: [['todos']],
  messages: ['CreatedTodo', 'RemovedTodo'],
  metadata: [],
  laws: { model: ['capped'] },
}

const ProductFields = Entity.define(
  'Product',
  Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    shelf: Schema.Literals(['back', 'front']),
    stock: Schema.Number,
    reserved: Schema.Number,
  }),
)
const Product = ProductFields.pipe(
  Entity.invariant<typeof ProductFields>(
    'reservedWithinStock',
    ({ after }) => Expr.lte(after.reserved, after.stock),
    { message: 'Reserved stock cannot exceed the stock', path: ['reserved'] },
  ),
)
const Front = Entity.refine(Product, 'Front', { shelf: 'front' })
const OrderFields = Entity.define(
  'Order',
  Schema.Struct({ id: Schema.String, paid: Schema.Number }),
)
const Order = OrderFields.pipe(
  Entity.invariant<typeof OrderFields>('paidOnce', ({ after }) => Expr.lte(after.paid, 1), {
    message: 'An order is paid once',
    path: ['paid'],
  }),
)

const Sell = {
  name: 'Sell',
  write: Write.update(
    Entity.input(Product, Schema.Struct({ id: Schema.String, quantity: Schema.Number }), {
      quantity: Entity.unmapped,
    }),
    { id: 'id', increment: { stock: 'quantity' } },
  ),
}
const Rename = {
  name: 'Rename',
  write: Write.update(
    Entity.input(Product, Schema.Struct({ id: Schema.String, name: Schema.String })),
    { id: 'id' },
  ),
}
const Shelve = {
  name: 'Shelve',
  write: Write.update(
    Entity.input(Product, Schema.Struct({ id: Schema.String, shelf: Schema.Literal('front') })),
    { id: 'id', becomes: Front },
  ),
}
const Pay = {
  name: 'Pay',
  write: Write.update(
    Entity.input(Order, Schema.Struct({ id: Schema.String, paid: Schema.Number })),
    { id: 'id' },
  ),
}

/** Two Entities' laws and four writes, as a Remote domain declares them. */
const shop: Contract = {
  kind: 'remote',
  name: 'shop',
  owner: App.owner,
  owns: [['remote']],
  observes: [['remote']],
  messages: [],
  metadata: [],
  laws: { entities: [Sell, Rename, Shelve, Pay] },
}

const kept = (transition: string, law: string) =>
  Evidence.runtimeOnly({ transition, law, why: 'only the writer refuses it' })

const Laws = Module.make(App, [document, shop])
const rulesOf = (findings: ReadonlyArray<{ readonly rule: string }>) =>
  findings.map(finding => finding.rule)

describe('Graph.of', () => {
  it('holds what each contract declares, its owners, and the paths its edges name', () => {
    const graph = Graph.of(Laws)
    expect(graph.nodes.filter(GraphNode.$is('Owner')).map(node => ({ ...node }))).toEqual([
      { _tag: 'Owner', kind: 'sync', name: 'todos' },
      { _tag: 'Owner', kind: 'remote', name: 'shop' },
    ])
    expect(graph.edges.filter(GraphEdge.$is('Owns')).map(edge => edge.owner)).toEqual([
      'sync:todos',
      'remote:shop',
    ])
    expect(
      graph.nodes.filter(GraphNode.$is('Path')).map(node => `${node.space}:${node.path.join('.')}`),
    ).toEqual([
      'model:todos',
      'model:remote',
      'entity:Product.stock',
      'entity:Product.reserved',
      'entity:Product.name',
      'entity:Product.shelf',
      'entity:Order.paid',
    ])
    expect(graph.nodes.filter(GraphNode.$is('State'))).toHaveLength(1)
    expect(graph.edges.filter(GraphEdge.$is('To'))).toHaveLength(1)
  })

  it('draws a document’s transitions from its Messages, even with no law', () => {
    const graph = Graph.of(Module.make(App, [{ ...document, laws: { model: [] } }]))
    expect(graph.nodes.filter(GraphNode.$is('Transition')).map(node => node.id)).toEqual([
      'durable:CreatedTodo',
      'durable:RemovedTodo',
    ])
    expect(graph.nodes.filter(GraphNode.$is('Law'))).toEqual([])
  })

  it('keeps no declared laws in the manifest, which is committed and diffed', () => {
    expect(Module.manifest(Laws).contracts.some(contract => 'laws' in contract)).toBe(false)
  })
})

describe('law-unwitnessed', () => {
  it('reports each transition that writes what a law reads, and no pair sharing no path', () => {
    const findings = Graph.validate(Laws, { evidence: [] }).filter(
      finding => finding.rule === 'law-unwitnessed',
    )
    expect(findings.map(finding => finding.message)).toEqual([
      'durable:CreatedTodo writes todos, which sync:todos.capped reads, and no evidence shows it keeps sync:todos.capped',
      'durable:RemovedTodo writes todos, which sync:todos.capped reads, and no evidence shows it keeps sync:todos.capped',
      'write:Sell writes Product.stock, which Product.reservedWithinStock reads, and no evidence shows it keeps Product.reservedWithinStock',
      'write:Pay writes Order.paid, which Order.paidOnce reads, and no evidence shows it keeps Order.paidOnce',
    ])
    expect(findings[2]!.contracts).toEqual(['remote:shop'])
  })

  it('matches a path within a path, either way round', () => {
    // A law over one field of the slice, declared beside a contract owning the whole list.
    const titles: Contract = {
      ...document,
      name: 'titles',
      owns: [['todos', 'title']],
      messages: [],
      laws: { model: ['short'] },
    }
    const retitled: Contract = {
      ...document,
      name: 'retitled',
      messages: ['ChangedFilter'],
      laws: { model: [] },
    }
    const graph = Graph.of(Module.make(App, [titles, retitled]))
    expect(Graph.breakersOf(graph, 'sync:titles.short').map(each => each.transition)).toEqual([
      'durable:ChangedFilter',
    ])
  })

  it('stops for a pair once an issued record joins it', () => {
    const findings = Graph.validate(Laws, {
      evidence: [
        kept('durable:CreatedTodo', 'sync:todos.capped'),
        kept('durable:RemovedTodo', 'sync:todos.capped'),
        kept('write:Sell', 'Product.reservedWithinStock'),
        kept('write:Pay', 'Order.paidOnce'),
      ],
    })
    expect(findings).toEqual([])
  })
})

describe('evidence-unmatched', () => {
  const unmatched = (evidence: ReadonlyArray<Evidence>) =>
    Graph.validate(Laws, { evidence }).filter(finding => finding.rule === 'evidence-unmatched')

  it('refuses a record typed by hand, and does not count it', () => {
    const typed = Evidence.Walked({
      transition: 'write:Sell',
      law: 'Product.reservedWithinStock',
      seeds: 200,
      steps: 12,
      starts: ['loaded'],
    })
    const findings = Graph.validate(Laws, { evidence: [typed] })
    expect(findings.filter(finding => finding.rule === 'evidence-unmatched')).toEqual([
      {
        rule: 'evidence-unmatched',
        contracts: ['remote:shop'],
        message:
          'Evidence that write:Sell keeps Product.reservedWithinStock was issued by no producer: it was typed by hand or copied',
      },
    ])
    expect(findings.some(finding => finding.message.startsWith('write:Sell writes'))).toBe(true)
    expect(
      Graph.breakersOf(Graph.of(Laws, { evidence: [typed] }), 'Product.reservedWithinStock'),
    ).toEqual([{ transition: 'write:Sell', paths: [['Product', 'stock']], evidence: [] }])
  })

  it('refuses a copy of an issued record', () => {
    const issued = kept('write:Sell', 'Product.reservedWithinStock')
    expect(rulesOf(unmatched([{ ...issued }]))).toEqual(['evidence-unmatched'])
  })

  it('refuses another Entity’s pair, a transition no contract declares, and a law none does', () => {
    expect(
      unmatched([
        kept('write:Pay', 'Product.reservedWithinStock'),
        kept('write:Gone', 'Product.reservedWithinStock'),
        kept('write:Sell', 'Product.gone'),
      ]).map(finding => finding.message),
    ).toEqual([
      'Evidence that write:Pay keeps Product.reservedWithinStock names a pair the graph does not join: write:Pay writes nothing beside what Product.reservedWithinStock reads',
      'Evidence that write:Gone keeps Product.reservedWithinStock names write:Gone, which no contract declares',
      'Evidence that write:Sell keeps Product.gone names Product.gone, which no contract declares',
    ])
  })

  it('admits a pair of one Entity that shares no member, as Laws.check records one kept by disjointness', () => {
    expect(unmatched([kept('write:Rename', 'Product.reservedWithinStock')])).toEqual([])
  })
})

describe('closed Surfaces', () => {
  const closed = (
    name: string,
    paths: 'todos' | 'both',
    messages: ReadonlyArray<typeof Message.CreatedTodo | typeof Message.RemovedTodo> = [
      Message.CreatedTodo,
    ],
  ) =>
    Surface.make(App, name, {
      model: ({ model }) =>
        paths === 'todos'
          ? Projection.struct({ todos: model.todos })
          : Projection.struct({ todos: model.todos, filter: model.filter }),
      messages: [...messages],
      closed: true,
    })

  it('are levels with a closure law reading their paths, which a durable Message must witness', () => {
    const graph = Graph.of(Module.make(App, [document, closed('Narrow', 'todos')]))
    expect(graph.nodes.filter(GraphNode.$is('Level')).map(level => level.surface)).toEqual([
      'Narrow',
    ])
    expect(graph.edges.filter(GraphEdge.$is('Observes')).map(edge => edge.path)).toEqual([
      ['todos'],
    ])
    expect(Graph.breakersOf(graph, 'closure:Narrow').map(each => each.transition)).toEqual([
      'durable:CreatedTodo',
      'durable:RemovedTodo',
    ])
  })

  it('refine one another by containment, the wider refining the narrower', () => {
    const graph = Graph.of(Module.make(App, [closed('Narrow', 'todos'), closed('Wide', 'both')]))
    expect(graph.edges.filter(GraphEdge.$is('Refines')).map(edge => ({ ...edge }))).toEqual([
      { _tag: 'Refines', level: 'Wide', of: 'Narrow' },
    ])
  })

  it('are reported when two are declared over the same paths and Messages', () => {
    const findings = Graph.validate(
      Module.make(App, [
        closed('One', 'todos'),
        closed('Two', 'todos'),
        closed('Other', 'todos', [Message.RemovedTodo]),
      ]),
    )
    expect(findings.filter(finding => finding.rule === 'level-declared-twice')).toEqual([
      {
        rule: 'level-declared-twice',
        contracts: ['surface:One', 'surface:Two'],
        message: 'surface:One and surface:Two are closed over the same paths and the same Messages',
      },
    ])
    expect(
      Graph.of(Module.make(App, [closed('One', 'todos'), closed('Two', 'todos')])).edges.filter(
        GraphEdge.$is('Refines'),
      ),
    ).toEqual([])
  })
})

describe('Graph.breakersOf', () => {
  it('names each transition that writes what the law reads, with its evidence', () => {
    const record = kept('write:Sell', 'Product.reservedWithinStock')
    const graph = Graph.of(Laws, { evidence: [record] })
    expect(Graph.breakersOf(graph, 'Product.reservedWithinStock')).toEqual([
      { transition: 'write:Sell', paths: [['Product', 'stock']], evidence: [record] },
    ])
    expect(Graph.breakersOf(graph, 'Order.paidOnce').map(each => each.evidence)).toEqual([[]])
  })

  it('throws for a law the graph does not hold', () => {
    expect(() => Graph.breakersOf(Graph.of(Laws), 'Product.reservedWithinStok')).toThrow(
      'Graph.breakersOf: the graph holds no law Product.reservedWithinStok',
    )
  })
})

describe('the renderers', () => {
  const evidence = [kept('write:Sell', 'Product.reservedWithinStock')]

  it('write a Laws section in Markdown: law by transition by evidence, then the findings', () => {
    const markdown = Graph.toMarkdown(Laws, { evidence })
    expect(markdown).toBe(
      [
        '## Laws',
        '',
        '| Law | Transition | Evidence |',
        '| --- | --- | --- |',
        '| sync:todos.capped | durable:CreatedTodo | **none** |',
        '| sync:todos.capped | durable:RemovedTodo | **none** |',
        '| Product.reservedWithinStock | write:Sell | runtime only: only the writer refuses it |',
        '| Order.paidOnce | write:Pay | **none** |',
        '',
        '### Findings',
        '',
        ...Graph.validate(Laws, { evidence }).map(
          finding => `- **${finding.rule}** ${finding.message}`,
        ),
      ].join('\n'),
    )
    expect(rulesOf(Graph.validate(Laws, { evidence }))).toEqual([
      'law-unwitnessed',
      'law-unwitnessed',
      'law-unwitnessed',
    ])
  })

  it('say a Module with no law declares none, and draw none', () => {
    const plain = Module.make(App, [{ ...document, laws: undefined }])
    expect(Graph.toMarkdown(plain)).toBe('## Laws\n\nNo contract declares a law.')
    expect(Graph.toMermaid(plain)).toBe('flowchart LR')
  })

  it('draw each law in Mermaid, a solid edge for evidence and a dotted one for none', () => {
    const mermaid = Graph.toMermaid(Laws, { evidence })
    expect(mermaid).toContain('  l1["Product.reservedWithinStock"]')
    expect(mermaid).toContain('  t2["write:Sell"]')
    expect(mermaid).toContain('  t2 -->|RuntimeOnly| l1')
    expect(mermaid).toContain('  t0 -.->|unwitnessed| l0')
  })
})

describe('Module', () => {
  // A page that reads only `Module` reaches none of the graph's code (see the registry budget).
  it('asks none of the graph’s rules, and renders no law', () => {
    const alike = (name: string) =>
      Surface.make(App, name, {
        model: ({ model }) => Projection.struct({ todos: model.todos }),
        messages: [Message.CreatedTodo],
        closed: true,
      })
    const module = Module.make(App, [document, shop, alike('One'), alike('Two')])
    expect(Module.validate(module)).toEqual([])
    expect(Module.manifest(module).findings).toEqual([])
    expect(Module.toMarkdown(module)).not.toContain('Laws')
    expect(Module.toMermaid(module)).not.toContain('capped')
    expect(rulesOf(Graph.validate(module))).toEqual(
      expect.arrayContaining(['law-unwitnessed', 'level-declared-twice']),
    )
  })
})
