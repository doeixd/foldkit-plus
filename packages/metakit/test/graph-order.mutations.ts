export default [
  {
    name: 'sparse graph lookups return hits in discovery order',
    edits: [
      {
        file: '../src/graph/structure.ts',
        find: 'return ids.sort((left, right) => ranks.get(left)! - ranks.get(right)!)',
        replace: 'return ids',
      },
    ],
    tests: ['packages/metakit/test/graph.test.ts'],
  },
]
