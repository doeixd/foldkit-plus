/**
 * The law half of the contract graph (#537): which transitions write what
 * which laws read, and what shows each keeps each. A contract declares its
 * laws and transitions as plain data (`Contract.laws`), and the graph derives
 * their nodes and edges here, when asked, so only a caller of `Module.graph`
 * or `validate` carries that code; a closed Surface contributes a level from
 * its flag; tests contribute evidence. The graph is data, and
 * `Module.validate` asks its one question of it: is every transition that can
 * break a law witnessed keeping it?
 */
import { Data, Option } from 'effect'
import { lawFactsOf, type LawEntry } from 'foldkit-entity'
import { Evidence } from 'foldkit-metadata'
import type { Contract } from './index.js'

/** Where a path is: a Model field (`['todos']`) or an Entity member (`['Product', 'stock']`). */
export type GraphSpace = 'model' | 'entity'

export type GraphNode = Data.TaggedEnum<{
  /** A contract that owns Model paths: `remote:Shop`, `sync:todos-capped`. */
  Owner: { readonly kind: string; readonly name: string }
  Path: { readonly space: GraphSpace; readonly path: ReadonlyArray<string> }
  /**
   * A declared write (`write:Sell`), with the Entity whose rows it writes, or
   * a durable Message (`durable:CreatedTodo`), with none.
   */
  Transition: {
    readonly id: string
    readonly kind: 'write' | 'durable'
    readonly entity?: string | undefined
  }
  /** An Entity's invariant (`Product.reservedWithinStock`), a document's law, or a closed Surface's closure. */
  Law: { readonly id: string }
  /** A declared state of an Entity. */
  State: { readonly entity: string; readonly name: string }
  /** A Surface declared `closed: true`. */
  Level: { readonly surface: string }
}>
export const GraphNode = /* @__PURE__ */ Data.taggedEnum<GraphNode>()

export type GraphEdge = Data.TaggedEnum<{
  /** `owner` (`kind:name`) is the authority for a Model path. */
  Owns: { readonly owner: string; readonly path: ReadonlyArray<string> }
  Reads: { readonly law: string; readonly space: GraphSpace; readonly path: ReadonlyArray<string> }
  Writes: {
    readonly transition: string
    readonly space: GraphSpace
    readonly path: ReadonlyArray<string>
  }
  /** A closed Surface's projection reads a Model path. */
  Observes: { readonly level: string; readonly path: ReadonlyArray<string> }
  /** The write starts only from this state. */
  From: { readonly transition: string; readonly entity: string; readonly state: string }
  /** The write leaves its row in this state. */
  To: { readonly transition: string; readonly entity: string; readonly state: string }
  /** The transition keeps the law, and the record that shows it. */
  Keeps: { readonly transition: string; readonly law: string; readonly evidence: Evidence }
  /** `level`'s projection contains every path of `of`'s, and more. */
  Refines: { readonly level: string; readonly of: string }
}>
export const GraphEdge = /* @__PURE__ */ Data.taggedEnum<GraphEdge>()

/** Nodes and edges, as `Module.graph` returns them. */
export interface GraphFacts {
  readonly nodes: ReadonlyArray<GraphNode>
  readonly edges: ReadonlyArray<GraphEdge>
}

/** What a contract declares of its laws, read by `Module.graph` when asked. */
export interface ContractLaws {
  /**
   * Laws over the contract's Model slice, by id, as a Sync document declares
   * them: each is `<kind>:<name>.<id>`, taken to read every path the contract
   * owns (a law is a function, so the whole slice), and each of the
   * contract's Messages is a transition `durable:<tag>` writing it. Given,
   * even empty, the transitions are drawn.
   */
  readonly model?: ReadonlyArray<string> | undefined
  /**
   * Transitions over Entities, as `Laws.check` takes them: a declared write
   * (`{ name, write }`, as `Mutation.write` returns), or one known by its
   * footprint. Each is `write:<name>`, beside each invariant of its Entity.
   */
  readonly entities?: ReadonlyArray<LawEntry> | undefined
}

/** An application's graph: every contract's facts, its closed Surfaces, and the evidence admitted. */
export interface Graph extends GraphFacts {}

/** What `Module.graph` and the rules over it read beside the contracts. */
export interface GraphOptions {
  /**
   * Records that a transition keeps a law: what a test's walks and scenarios
   * returned, `Laws.check`'s `Enumerated` records, and `Evidence.runtimeOnly`
   * lines. One issued by no producer, or naming a pair the graph does not
   * join, is not admitted and is reported as `evidence-unmatched`.
   */
  readonly evidence?: ReadonlyArray<Evidence> | undefined
}

/** A transition that writes a path a law reads, and what shows it keeps the law (empty: nothing). */
export interface Breaker {
  readonly transition: string
  /** The paths it writes that the law reads, in the law's space. */
  readonly paths: ReadonlyArray<ReadonlyArray<string>>
  readonly evidence: ReadonlyArray<Evidence>
}

interface Located {
  readonly space: GraphSpace
  readonly path: ReadonlyArray<string>
}

/** A record not admitted, and why, for `evidence-unmatched`. */
export interface Unmatched {
  readonly record: Evidence
  readonly contracts: ReadonlyArray<string>
  readonly message: string
}

/** The graph, with who contributed each law and transition and what evidence was turned away. */
export interface Assembled {
  readonly graph: Graph
  readonly contributors: ReadonlyMap<string, ReadonlyArray<string>>
  readonly unmatched: ReadonlyArray<Unmatched>
}

export const labelOf = (contract: Contract): string => `${contract.kind}:${contract.name}`

const isPrefix = (prefix: ReadonlyArray<string>, path: ReadonlyArray<string>): boolean =>
  prefix.length <= path.length && prefix.every((segment, index) => segment === path[index])

/** One path is within the other: writing `['todos']` writes `['todos', 'title']`, and the reverse. */
const overlaps = (a: Located, b: Located): boolean =>
  a.space === b.space &&
  a.path.length > 0 &&
  b.path.length > 0 &&
  (isPrefix(a.path, b.path) || isPrefix(b.path, a.path))

export const pathText = (path: ReadonlyArray<string>): string => path.join('.')

const keyOf = (value: unknown): string => JSON.stringify(value)

/** A contract's declared laws as nodes and edges. */
const factsOf = (contract: Contract, laws: ContractLaws): GraphFacts => {
  const model = (laws.model ?? []).map(id => `${labelOf(contract)}.${id}`)
  const durable = laws.model === undefined ? [] : contract.messages.map(tag => `durable:${tag}`)
  // An Entity's laws come out shaped as the graph's own nodes and edges.
  const entities: GraphFacts = lawFactsOf(laws.entities ?? [])
  return {
    nodes: [
      ...model.map(id => GraphNode.Law({ id })),
      ...durable.map(id => GraphNode.Transition({ id, kind: 'durable' })),
      ...entities.nodes,
    ],
    edges: [
      ...model.flatMap(law =>
        contract.owns.map(path => GraphEdge.Reads({ law, space: 'model', path })),
      ),
      ...durable.flatMap(transition =>
        contract.owns.map(path => GraphEdge.Writes({ transition, space: 'model', path })),
      ),
      ...entities.edges,
    ],
  }
}

/** The contracts' declared laws, their closed Surfaces as levels, and the evidence that joins a pair. */
export const assemble = (contracts: ReadonlyArray<Contract>, options: GraphOptions): Assembled => {
  const nodes = new Map<string, GraphNode>()
  const edges = new Map<string, GraphEdge>()
  const contributors = new Map<string, Array<string>>()
  const reads = new Map<string, Array<Located>>()
  const writes = new Map<string, Array<Located>>()
  const levels: Array<Contract> = []

  const node = (made: GraphNode) => nodes.set(keyOf(made), made)
  const contributed = (key: string, label: string) => {
    const known = contributors.get(key) ?? []
    if (!known.includes(label)) contributors.set(key, [...known, label])
  }
  const located = (into: Map<string, Array<Located>>, id: string, at: Located) => {
    const known = into.get(id) ?? []
    if (!known.some(each => each.space === at.space && keyOf(each.path) === keyOf(at.path)))
      into.set(id, [...known, at])
    node(GraphNode.Path({ space: at.space, path: at.path }))
  }
  const edge = (made: GraphEdge) => {
    const kept = GraphEdge.$match(made, {
      Owns: ({ path }) => {
        node(GraphNode.Path({ space: 'model', path }))
        return true
      },
      Reads: ({ law, space, path }) => {
        located(reads, law, { space, path })
        return true
      },
      Writes: ({ transition, space, path }) => {
        located(writes, transition, { space, path })
        return true
      },
      Observes: ({ path }) => {
        node(GraphNode.Path({ space: 'model', path }))
        return true
      },
      From: () => true,
      To: () => true,
      // Only admitted evidence is a keeps edge, made below.
      Keeps: () => false,
      Refines: () => true,
    })
    if (kept) edges.set(keyOf(made), made)
  }

  for (const contract of new Set(contracts)) {
    const label = labelOf(contract)
    if (contract.owns.length > 0) {
      node(GraphNode.Owner({ kind: contract.kind, name: contract.name }))
      for (const path of contract.owns) edge(GraphEdge.Owns({ owner: label, path }))
    }
    if (contract.closed === true) {
      const law = `closure:${contract.name}`
      node(GraphNode.Level({ surface: contract.name }))
      node(GraphNode.Law({ id: law }))
      contributed(`law:${law}`, label)
      levels.push(contract)
      for (const path of contract.observes) {
        edge(GraphEdge.Observes({ level: contract.name, path }))
        edge(GraphEdge.Reads({ law, space: 'model', path }))
      }
    }
    if (contract.laws === undefined) continue
    const facts = factsOf(contract, contract.laws)
    for (const made of facts.nodes) {
      node(made)
      const key = GraphNode.$match(made, {
        Owner: () => Option.none<string>(),
        Path: () => Option.none<string>(),
        Transition: ({ id }) => Option.some(`transition:${id}`),
        Law: ({ id }) => Option.some(`law:${id}`),
        State: () => Option.none<string>(),
        Level: () => Option.none<string>(),
      })
      if (Option.isSome(key)) contributed(key.value, label)
    }
    for (const made of facts.edges) edge(made)
  }

  // A level refines another when its paths cover every one of the other's and the reverse fails.
  const covers = (wider: Contract, narrower: Contract) =>
    narrower.observes.every(path => wider.observes.some(own => isPrefix(own, path)))
  for (const a of levels)
    for (const b of levels)
      if (a !== b && covers(a, b) && !covers(b, a))
        edge(GraphEdge.Refines({ level: a.name, of: b.name }))

  const laws = new Set([...nodes.values()].filter(GraphNode.$is('Law')).map(law => law.id))
  const transitions = new Map(
    [...nodes.values()]
      .filter(GraphNode.$is('Transition'))
      .map(transition => [transition.id, transition.entity] as const),
  )
  const unmatched: Array<Unmatched> = []
  const kept = new Set<Evidence>()
  const admit = (record: Evidence) => {
    const { transition, law } = record
    const involved = [
      ...(contributors.get(`transition:${transition}`) ?? []),
      ...(contributors.get(`law:${law}`) ?? []),
    ]
    const refuse = (why: string): void => {
      unmatched.push({
        record,
        contracts: [...new Set(involved)],
        message: `Evidence that ${transition} keeps ${law} ${why}`,
      })
    }
    if (Option.isNone(Evidence.issuedBy(record)))
      return refuse('was issued by no producer: it was typed by hand or copied')
    if (!transitions.has(transition))
      return refuse(`names ${transition}, which no contract declares`)
    if (!laws.has(law)) return refuse(`names ${law}, which no contract declares`)
    // What a record's pair must share. Over an Entity, the Entity: a pair within one is joined
    // even when it shares no member, as `Laws.check` records one kept by disjointness, and a
    // transition's own Entity counts where it writes no member (a delete). Over the Model, a
    // path: Model laws read their owner's slice, so a slice is what tells two owners apart.
    const written = writes.get(transition) ?? []
    const entity = transitions.get(transition)
    const entities = new Set([
      ...written.flatMap(at => (at.space === 'entity' ? [at.path[0]] : [])),
      ...(entity === undefined ? [] : [entity]),
    ])
    const joins = (at: Located) =>
      at.space === 'entity' ? entities.has(at.path[0]) : written.some(each => overlaps(each, at))
    if (!(reads.get(law) ?? []).some(joins))
      return refuse(
        `names a pair the graph does not join: ${transition} writes nothing beside what ${law} reads`,
      )
    if (kept.has(record)) return
    kept.add(record)
    // Every admitted record is an edge of its own: a walk and a scenario of one pair are two.
    edges.set(`keeps:${kept.size}`, GraphEdge.Keeps({ transition, law, evidence: record }))
  }
  for (const record of options.evidence ?? []) admit(record)

  return {
    graph: { nodes: [...nodes.values()], edges: [...edges.values()] },
    contributors,
    unmatched,
  }
}

/** The ids of the graph's laws, in the order contracts declared them. */
export const lawsOf = (graph: Graph): ReadonlyArray<string> =>
  graph.nodes.filter(GraphNode.$is('Law')).map(law => law.id)

const breakers = (graph: Graph, law: string): ReadonlyArray<Breaker> => {
  const read = graph.edges
    .filter(GraphEdge.$is('Reads'))
    .filter(edge => edge.law === law)
    .map(({ space, path }) => ({ space, path }))
  const keeps = graph.edges.filter(GraphEdge.$is('Keeps')).filter(edge => edge.law === law)
  return graph.nodes.filter(GraphNode.$is('Transition')).flatMap(({ id }) => {
    const paths = graph.edges
      .filter(GraphEdge.$is('Writes'))
      .filter(edge => edge.transition === id && read.some(at => overlaps(at, edge)))
      .map(edge => edge.path)
    if (paths.length === 0) return []
    const evidence = keeps.filter(edge => edge.transition === id).map(edge => edge.evidence)
    return [{ transition: id, paths, evidence }]
  })
}

export const Graph = {
  /**
   * Each transition that writes a path `law` reads, which is each that could
   * break it, and the evidence admitted that it keeps it. Throws for a law
   * the graph does not hold, which a misspelt id would otherwise answer with
   * nothing.
   */
  breakersOf: (graph: Graph, law: string): ReadonlyArray<Breaker> => {
    if (!lawsOf(graph).includes(law))
      throw new Error(`Graph.breakersOf: the graph holds no law ${law}`)
    return breakers(graph, law)
  },
}

/** A finding of the three rules over the graph, in `Module.validate`'s shape. */
export interface GraphFinding {
  readonly rule: 'law-unwitnessed' | 'evidence-unmatched' | 'level-declared-twice'
  readonly contracts: ReadonlyArray<string>
  readonly message: string
}

const sameSet = (a: ReadonlyArray<string>, b: ReadonlyArray<string>): boolean =>
  a.length === b.length && a.every(each => b.includes(each)) && b.every(each => a.includes(each))

/**
 * Each pair a transition can break and nothing shows it keeps
 * (`law-unwitnessed`), each record not admitted (`evidence-unmatched`), and
 * each two closed Surfaces with one projection and one Message set
 * (`level-declared-twice`).
 */
export const graphFindings = (
  contracts: ReadonlyArray<Contract>,
  { graph, contributors, unmatched }: Assembled,
): ReadonlyArray<GraphFinding> => {
  const involved = (transition: string, law: string) => [
    ...new Set([
      ...(contributors.get(`transition:${transition}`) ?? []),
      ...(contributors.get(`law:${law}`) ?? []),
    ]),
  ]
  const findings: Array<GraphFinding> = lawsOf(graph).flatMap(law =>
    breakers(graph, law)
      .filter(breaker => breaker.evidence.length === 0)
      .map(({ transition, paths }) => ({
        rule: 'law-unwitnessed' as const,
        contracts: involved(transition, law),
        message: `${transition} writes ${paths.map(pathText).join(', ')}, which ${law} reads, and no evidence shows it keeps ${law}`,
      })),
  )
  for (const { contracts: named, message } of unmatched)
    findings.push({ rule: 'evidence-unmatched', contracts: named, message })
  const closed = [...new Set(contracts)].filter(contract => contract.closed === true)
  for (let i = 0; i < closed.length; i += 1)
    for (let j = i + 1; j < closed.length; j += 1) {
      const [a, b] = [closed[i]!, closed[j]!]
      if (
        sameSet(a.observes.map(pathText), b.observes.map(pathText)) &&
        sameSet(a.messages, b.messages)
      )
        findings.push({
          rule: 'level-declared-twice',
          contracts: [labelOf(a), labelOf(b)],
          message: `${labelOf(a)} and ${labelOf(b)} are closed over the same paths and the same Messages`,
        })
    }
  return findings
}

/** One line of a record, for the renderers. */
export const evidenceText = (record: Evidence): string =>
  Evidence.$match(record, {
    Enumerated: () => 'enumerated',
    Walked: ({ seeds, steps, starts }) =>
      `walked: ${seeds} seeds of ${steps} steps from ${starts.join(', ')}`,
    Scenario: ({ name, runner }) => `scenario on ${runner}: ${name}`,
    RuntimeOnly: ({ why }) => `runtime only: ${why}`,
  })
