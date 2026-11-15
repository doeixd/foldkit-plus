/**
 * The declared writes in the law graph, broken in turn:
 * `pnpm mutate examples/writes/test/graph.mutations.ts`.
 */
const tests = ['examples/writes/test/graph.test.ts', 'examples/writes/test/laws.test.ts']

export default [
  {
    name: 'the rules over the graph are dropped',
    edits: [
      {
        file: '../../../packages/surface/src/graph.ts',
        find: '    findingsOf(module.contracts, assemble(module.contracts, options)),',
        replace: '    [],',
      },
    ],
    tests,
  },
  {
    name: 'a domain declares no write',
    edits: [
      {
        file: '../../../packages/remote/src/domain.ts',
        find: '          write === undefined ? [] : [{ name, write }],',
        replace: '          [],',
      },
    ],
    tests,
  },
  {
    name: 'the evidence option is ignored',
    edits: [
      {
        file: '../../../packages/surface/src/graph.ts',
        find: '  for (const record of options.evidence ?? []) admit(record)\n',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a pair of two Entities is joined',
    edits: [
      {
        file: '../../../packages/surface/src/graph.ts',
        find: "at.space === 'entity' ? entities.has(at.path[0]) :",
        replace: "at.space === 'entity' ? true :",
      },
    ],
    tests: ['examples/writes/test/graph.test.ts'],
  },
]
