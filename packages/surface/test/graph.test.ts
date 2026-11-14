/**
 * The law half of the contract graph (#537): facts contracts contribute, the
 * levels closed Surfaces make, the evidence admitted, and the three rules
 * `Module.validate` asks over them.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Evidence } from 'foldkit-metadata'
import { describe, expect, it, vi } from 'vitest'
import {
  Graph,
  GraphEdge,
  GraphNode,
  Module,
  Projection,
  Surface,
  type Contract,
  type GraphFacts,
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

/** A document of todos with one law over them, as `Sync.forApplication(App).make` contributes it. */
const documentFacts = (): GraphFacts => ({
  nodes: [
    GraphNode.Law({ id: 'sync:todos.capped' }),
    GraphNode.Transition({ id: 'durable:CreatedTodo', kind: 'durable' }),
    GraphNode.Transition({ id: 'durable:RemovedTodo', kind: 'durable' }),
  ],
  edges: [
    GraphEdge.Reads({ law: 'sync:todos.capped', space: 'model', path: ['todos'] }),
    GraphEdge.Writes({ transition: 'durable:CreatedTodo', space: 'model', path: ['todos'] }),
    GraphEdge.Writes({ transition: 'durable:RemovedTodo', space: 'model', path: ['todos'] }),
  ],
})
const document: Contract = {
  kind: 'sync',
  name: 'todos',
  owner: App.owner,
  owns: [['todos']],
  observes: [['todos']],
  messages: ['CreatedTodo', 'RemovedTodo'],
  metadata: [],
  facts: documentFacts,
}

const member = (entity: string, key: string) => ({ space: 'entity' as const, path: [entity, key] })

/** Two Entities' laws and three writes, as a Remote domain contributes them. */
const shop: Contract = {
  kind: 'remote',
  name: 'shop',
  owner: App.owner,
  owns: [['remote']],
  observes: [['remote']],
  messages: [],
  metadata: [],
  facts: () => ({
    nodes: [
      GraphNode.Law({ id: 'Product.reservedWithinStock' }),
      GraphNode.Law({ id: 'Order.paidOnce' }),
      GraphNode.Transition({ id: 'write:Sell', kind: 'write' }),
      GraphNode.Transition({ id: 'write:Rename', kind: 'write' }),
      GraphNode.Transition({ id: 'write:Pay', kind: 'write' }),
      GraphNode.State({ entity: 'Product', name: 'InStock' }),
    ],
    edges: [
      GraphEdge.Reads({ law: 'Product.reservedWithinStock', ...member('Product', 'reserved') }),
      GraphEdge.Reads({ law: 'Product.reservedWithinStock', ...member('Product', 'stock') }),
      GraphEdge.Reads({ law: 'Order.paidOnce', ...member('Order', 'paid') }),
      GraphEdge.Writes({ transition: 'write:Sell', ...member('Product', 'stock') }),
      GraphEdge.Writes({ transition: 'write:Rename', ...member('Product', 'name') }),
      GraphEdge.Writes({ transition: 'write:Pay', ...member('Order', 'paid') }),
      GraphEdge.To({ transition: 'write:Sell', entity: 'Product', state: 'InStock' }),
    ],
  }),
}

const kept = (transition: string, law: string) =>
  Evidence.runtimeOnly({ transition, law, why: 'only the writer refuses it' })

const Laws = Module.make(App, [document, shop])
const rulesOf = (findings: ReadonlyArray<{ readonly rule: string }>) =>
  findings.map(finding => finding.rule)

describe('Module.graph', () => {
  it('holds each contract’s facts, its owners, and the paths its edges name', () => {
    const graph = Module.graph(Laws)
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
      'entity:Product.reserved',
      'entity:Product.stock',
      'entity:Order.paid',
      'entity:Product.name',
    ])
    expect(graph.nodes.filter(GraphNode.$is('State'))).toHaveLength(1)
    expect(graph.edges.filter(GraphEdge.$is('To'))).toHaveLength(1)
  })

  it('asks a contract for its facts when the graph is asked, not when the Module is made', () => {
    const facts = vi.fn(documentFacts)
    const asked = Module.make(App, [{ ...document, facts }])
    expect(facts).not.toHaveBeenCalled()
    Module.graph(asked)
    expect(facts).toHaveBeenCalledTimes(1)
  })

  it('keeps no facts in the manifest, which is committed and diffed', () => {
    expect(Module.manifest(Laws).contracts.some(contract => 'facts' in contract)).toBe(false)
  })
})

describe('law-unwitnessed', () => {
  it('reports each transition that writes what a law reads, and no pair sharing no path', () => {
    const findings = Module.validate(Laws).filter(finding => finding.rule === 'law-unwitnessed')
    expect(findings.map(finding => finding.message)).toEqual([
      'durable:CreatedTodo writes todos, which sync:todos.capped reads, and no evidence shows it keeps sync:todos.capped',
      'durable:RemovedTodo writes todos, which sync:todos.capped reads, and no evidence shows it keeps sync:todos.capped',
      'write:Sell writes Product.stock, which Product.reservedWithinStock reads, and no evidence shows it keeps Product.reservedWithinStock',
      'write:Pay writes Order.paid, which Order.paidOnce reads, and no evidence shows it keeps Order.paidOnce',
    ])
    expect(findings[2]!.contracts).toEqual(['remote:shop'])
  })

  it('matches a path within a path, either way round', () => {
    const nested: Contract = {
      ...document,
      name: 'titles',
      owns: [],
      messages: [],
      facts: () => ({
        nodes: [
          GraphNode.Law({ id: 'sync:titles.short' }),
          GraphNode.Transition({ id: 'durable:Retitled', kind: 'durable' }),
        ],
        edges: [
          GraphEdge.Reads({ law: 'sync:titles.short', space: 'model', path: ['todos', 'title'] }),
          GraphEdge.Writes({ transition: 'durable:Retitled', space: 'model', path: ['todos'] }),
        ],
      }),
    }
    const graph = Module.graph(Module.make(App, [nested]))
    expect(Graph.breakersOf(graph, 'sync:titles.short').map(each => each.transition)).toEqual([
      'durable:Retitled',
    ])
  })

  it('stops for a pair once an issued record joins it', () => {
    const findings = Module.validate(Laws, {
      evidence: [
        kept('durable:CreatedTodo', 'sync:todos.capped'),
        kept('durable:RemovedTodo', 'sync:todos.capped'),
        kept('write:Sell', 'Product.reservedWithinStock'),
        kept('write:Pay', 'Order.paidOnce'),
      ],
    })
    expect(findings).toEqual([])
  })

  it('takes a keeps edge a contract contributes, as the evidence option’s', () => {
    const record = kept('write:Pay', 'Order.paidOnce')
    const withKeeps: Contract = {
      ...shop,
      facts: () => {
        const { nodes, edges } = shop.facts!()
        const keeps = GraphEdge.Keeps({
          transition: 'write:Pay',
          law: 'Order.paidOnce',
          evidence: record,
        })
        return { nodes, edges: [...edges, keeps] }
      },
    }
    const messages = Module.validate(Module.make(App, [withKeeps])).map(each => each.message)
    expect(messages.some(message => message.startsWith('write:Pay'))).toBe(false)
    expect(messages.some(message => message.startsWith('write:Sell'))).toBe(true)
  })
})

describe('evidence-unmatched', () => {
  const unmatched = (evidence: ReadonlyArray<Evidence>) =>
    Module.validate(Laws, { evidence }).filter(finding => finding.rule === 'evidence-unmatched')

  it('refuses a record typed by hand, and does not count it', () => {
    const typed = Evidence.Walked({
      transition: 'write:Sell',
      law: 'Product.reservedWithinStock',
      seeds: 200,
      steps: 12,
      starts: ['loaded'],
    })
    const findings = Module.validate(Laws, { evidence: [typed] })
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
      Graph.breakersOf(Module.graph(Laws, { evidence: [typed] }), 'Product.reservedWithinStock'),
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
    const graph = Module.graph(Module.make(App, [document, closed('Narrow', 'todos')]))
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
    const graph = Module.graph(
      Module.make(App, [closed('Narrow', 'todos'), closed('Wide', 'both')]),
    )
    expect(graph.edges.filter(GraphEdge.$is('Refines')).map(edge => ({ ...edge }))).toEqual([
      { _tag: 'Refines', level: 'Wide', of: 'Narrow' },
    ])
  })

  it('are reported when two are declared over the same paths and Messages', () => {
    const findings = Module.validate(
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
      Module.graph(Module.make(App, [closed('One', 'todos'), closed('Two', 'todos')])).edges.filter(
        GraphEdge.$is('Refines'),
      ),
    ).toEqual([])
  })
})

describe('Graph.breakersOf', () => {
  it('names each transition that writes what the law reads, with its evidence', () => {
    const record = kept('write:Sell', 'Product.reservedWithinStock')
    const graph = Module.graph(Laws, { evidence: [record] })
    expect(Graph.breakersOf(graph, 'Product.reservedWithinStock')).toEqual([
      { transition: 'write:Sell', paths: [['Product', 'stock']], evidence: [record] },
    ])
    expect(Graph.breakersOf(graph, 'Order.paidOnce').map(each => each.evidence)).toEqual([[]])
  })

  it('throws for a law the graph does not hold', () => {
    expect(() => Graph.breakersOf(Module.graph(Laws), 'Product.reservedWithinStok')).toThrow(
      'Graph.breakersOf: the graph holds no law Product.reservedWithinStok',
    )
  })
})

describe('the renderers', () => {
  const evidence = [kept('write:Sell', 'Product.reservedWithinStock')]

  it('add a Laws section to the Markdown: law by transition by evidence', () => {
    const markdown = Module.toMarkdown(Laws, { evidence })
    expect(markdown).toContain(
      [
        '## Laws',
        '',
        '| Law | Transition | Evidence |',
        '| --- | --- | --- |',
        '| sync:todos.capped | durable:CreatedTodo | **none** |',
        '| sync:todos.capped | durable:RemovedTodo | **none** |',
        '| Product.reservedWithinStock | write:Sell | runtime only: only the writer refuses it |',
        '| Order.paidOnce | write:Pay | **none** |',
      ].join('\n'),
    )
    expect(markdown.indexOf('## Laws')).toBeLessThan(markdown.indexOf('## Findings'))
  })

  it('leave the Laws section out of a Module with no law', () => {
    const plain = Module.make(App, [{ ...document, facts: undefined }])
    expect(Module.toMarkdown(plain)).not.toContain('## Laws')
    expect(Module.toMermaid(plain)).not.toContain('subgraph Laws')
  })

  it('draw each law in Mermaid, a solid edge for evidence and a dotted one for none', () => {
    const mermaid = Module.toMermaid(Laws, { evidence })
    expect(mermaid).toContain('  subgraph Laws')
    expect(mermaid).toContain('    l1["Product.reservedWithinStock"]')
    expect(mermaid).toContain('    t2["write:Sell"]')
    expect(mermaid).toContain('  t2 -->|RuntimeOnly| l1')
    expect(mermaid).toContain('  t0 -.->|unwitnessed| l0')
  })
})

describe('a Module with no facts', () => {
  it('validates with one argument as it did before the graph', () => {
    const plain = Module.make(App, [
      { ...document, facts: undefined },
      { ...shop, facts: undefined },
    ])
    expect(Module.validate(plain)).toEqual([])
  })
})
