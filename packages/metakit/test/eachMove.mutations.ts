const tests = ['packages/metakit/test/eachMove.test.ts']

export default [
  {
    name: 'Machine.each skips key field validation',
    edits: [
      {
        file: '../src/machine.ts',
        find: 'if (Option.isNone(keyProp)) {',
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
        find: 'if (next.length === list.length && next.every((item, i) => item === list[i])) {',
        replace: 'if (false) {',
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
