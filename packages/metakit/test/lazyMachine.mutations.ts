export default [
  {
    name: 'Transition.lazy does not clear inflight on rejection',
    edits: [
      {
        file: '../src/transition.ts',
        find: '        err => {\n          inflight = undefined\n          throw err\n        },',
        replace: '        err => {\n          throw err\n        },',
      },
    ],
    tests: ['packages/metakit/test/lazyMachine.test.ts'],
  },
  {
    name: 'Machine.lazyChild does not deduplicate concurrent resolves',
    edits: [
      {
        file: '../src/machine.ts',
        find: '    if (inflight !== undefined) return inflight',
        replace: '    if (false && inflight !== undefined) return inflight',
      },
    ],
    tests: ['packages/metakit/test/lazyMachine.test.ts'],
  },
]
