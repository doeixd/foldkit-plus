/**
 * The declared writes in the Module graph, broken in turn:
 * `pnpm mutate examples/writes/test/graph.mutations.ts`.
 */
const tests = ['examples/writes/test/graph.test.ts', 'examples/writes/test/laws.test.ts']

export default [
  {
    name: 'the rules over the graph are dropped',
    edits: [
      {
        file: '../../../packages/surface/src/index.ts',
        find: '      findings.push(...graphFindings(module.contracts, assemble(module.contracts, options)))\n',
        replace: '      void options\n',
      },
    ],
    tests,
  },
  {
    name: 'a declared write holds no facts',
    edits: [
      {
        file: '../../../packages/remote/src/mutationDescriptor.ts',
        find: '    [Facts]: () => writeFacts(name, write),\n',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'the evidence option is ignored',
    edits: [
      {
        file: '../../../packages/surface/src/graph.ts',
        find: '  for (const record of options.evidence ?? []) admit(record, undefined)\n',
        replace: '',
      },
    ],
    tests,
  },
]
