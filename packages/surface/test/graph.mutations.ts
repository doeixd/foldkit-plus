/**
 * The graph and its three rules: `pnpm mutate packages/surface/test/graph.mutations.ts`.
 */
const tests = ['packages/surface/test/graph.test.ts']

const edit = (name: string, find: string, replace: string, file = '../src/graph.ts') => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit(
    'the rules over the graph are dropped',
    '      findings.push(...graphFindings(module.contracts, assemble(module.contracts, options)))\n',
    '      void options\n',
    '../src/index.ts',
  ),
  edit(
    'one argument runs the rules over the graph',
    '    if (options.evidence !== undefined)\n',
    '    if (true)\n',
    '../src/index.ts',
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
    '    if (!(reads.get(law) ?? []).some(at => roots.has(rootOf(at))))\n',
    '    if (false)\n',
  ),
  edit(
    'a pair sharing no path is reported',
    '  (isPrefix(a.path, b.path) || isPrefix(b.path, a.path))',
    '  a.space === b.space',
  ),
  edit(
    'a path within a path matches one way only',
    '  (isPrefix(a.path, b.path) || isPrefix(b.path, a.path))',
    '  isPrefix(a.path, b.path)',
  ),
  edit(
    'refines is computed the wrong way round',
    '        edge(GraphEdge.Refines({ level: a.contract.name, of: b.contract.name }), a.label)',
    '        edge(GraphEdge.Refines({ level: b.contract.name, of: a.contract.name }), b.label)',
  ),
  edit('a level refines one with the same paths', ' && !covers(b.contract, a.contract)', ''),
  edit(
    'two levels are alike whatever their Messages',
    '        sameSet(a.messages, b.messages)',
    '        true',
  ),
  edit(
    'a contract’s keeps edge is dropped',
    '        candidates.push({ record: evidence, from: label })\n',
    '',
  ),
  edit(
    'breakersOf answers nothing for an unknown law',
    '    if (!lawsOf(graph).includes(law))\n      throw new Error(`Graph.breakersOf: the graph holds no law ${law}`)\n',
    '',
  ),
]
