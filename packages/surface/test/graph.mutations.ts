/**
 * The graph, its rules and its renderers: `pnpm mutate packages/surface/test/graph.mutations.ts`.
 */
const tests = ['packages/surface/test/graph.test.ts']

const edit = (name: string, find: string, replace: string, file = '../src/graph.ts') => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit(
    'Graph.validate asks no rule',
    '    findingsOf(module.contracts, assemble(module.contracts, options)),',
    '    [],',
  ),
  edit(
    'the Laws section leaves out the findings',
    '    if (findings.length > 0) {',
    '    if (false) {',
  ),
  edit(
    'law-unwitnessed is dropped',
    '      .filter(breaker => breaker.evidence.length === 0)\n',
    '      .filter(() => false)\n',
  ),
  edit(
    'an unissued record is accepted',
    '    if (Option.isNone(Evidence.issuedBy(record)))\n',
    '    if (false)\n',
  ),
  edit(
    'a pair of two Entities is joined',
    "    const joins = (at: Located) => (at.space === 'entity' ? entities.has(at.path[0]) : modelDirect)",
    '    const joins = () => true',
  ),
  edit(
    'breakers ignores direct overlap filter and reports bridged or empty',
    "      if (reason.kind !== 'direct' || Option.isNone(reason.write.path)) continue",
    "      if (reason.kind === 'direct' || Option.isNone(reason.write.path)) continue",
  ),
  edit(
    'remote row-to-model links are omitted from the unified dependency graph',
    '    links,\n  })',
    '    links: [],\n  })',
  ),
  edit(
    'refines is computed the wrong way round',
    '        edge(GraphEdge.Refines({ level: a.name, of: b.name }))',
    '        edge(GraphEdge.Refines({ level: b.name, of: a.name }))',
  ),
  edit('a level refines one with the same paths', ' && !covers(b, a)', ''),
  edit(
    'two levels are alike whatever their Messages',
    '        sameSet(a.messages, b.messages)',
    '        true',
  ),
  edit(
    'a document with no law draws no transition',
    '  const durable = laws.model === undefined ? [] : contract.messages',
    '  const durable = (laws.model ?? []).length === 0 ? [] : contract.messages',
  ),
  edit(
    'a contract’s Entity laws are dropped',
    '  const entities: GraphFacts = lawFactsOf(laws.entities ?? [])',
    '  const entities: GraphFacts = lawFactsOf([])',
  ),
  edit(
    'a model law reads nothing',
    "        contract.owns.map(path => GraphEdge.Reads({ law, space: 'model', path })),",
    '        [],',
  ),
  edit(
    'breakersOf answers nothing for an unknown law',
    '    if (!lawsOf(graph).includes(law))\n      throw new Error(`Graph.breakersOf: the graph holds no law ${law}`)\n',
    '',
  ),
]
