export default [
  {
    name: 'query readiness ignores the configured renderer',
    edits: [
      {
        file: '../src/graph/readiness.ts',
        find: ': options.prepare(residual)',
        replace: ": lowerNode(residual.node, { dialect: 'postgres', rowPrefix })",
      },
    ],
    tests: ['packages/metakit/test/graph.test.ts'],
  },
]
