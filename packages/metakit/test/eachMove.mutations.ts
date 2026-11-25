const tests = ['packages/metakit/test/eachMove.test.ts']

export default [
  {
    name: 'Machine.each skips key field validation',
    edits: [
      {
        file: '../src/machine.ts',
        find: 'if (!hasKeyField(child.stateSchema.ast, key)) {',
        replace: 'if (false) {',
      },
    ],
    tests,
  },
  {
    name: 'arr.move allocates a new array when element is already at target index',
    edits: [
      {
        file: '../src/ops/arr.ts',
        find: 'if (from === target) return list',
        replace: 'if (from === target) return list.slice()',
      },
    ],
    tests,
  },
  {
    name: 'writeProperties.move drops idempotent claim',
    edits: [
      {
        file: '../src/ops/ways.ts',
        find: "move: { commutes: {}, idempotent: 'always' },",
        replace: 'move: { commutes: {} },',
      },
    ],
    tests,
  },
]
