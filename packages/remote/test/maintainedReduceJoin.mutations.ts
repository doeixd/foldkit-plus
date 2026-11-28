export default [
  {
    name: 'reduceKeeper skips inverse on replace',
    edits: [
      {
        file: '../src/maintained/reduce.ts',
        find: '    if (inverse !== undefined) {\n      change(() => {\n        const without = inverse(current, bv)',
        replace:
          '    if (false && inverse !== undefined) {\n      change(() => {\n        const without = inverse(current, bv)',
      },
    ],
    tests: ['packages/remote/test/maintainedReduceJoin.test.ts'],
  },
  {
    name: 'joinKeeper forgets to remove old target on reparent',
    edits: [
      {
        file: '../src/maintained/join.ts',
        find: '      if (prevTarget !== undefined) {\n        reverse.remove(prevTarget, key)',
        replace:
          '      if (false && prevTarget !== undefined) {\n        reverse.remove(prevTarget, key)',
      },
    ],
    tests: ['packages/remote/test/maintainedReduceJoin.test.ts'],
  },
]
