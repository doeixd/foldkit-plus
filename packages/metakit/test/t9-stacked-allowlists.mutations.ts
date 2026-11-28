const tests = ['packages/metakit/test/t9-stacked-allowlists.test.ts']

export default [
  {
    name: 'a later allowlist replaces the earlier one',
    edits: [
      {
        file: '../src/interpreter.ts',
        find: 'allowlist: intersectAllowlists(allowlist, next.allowlist),',
        replace: 'allowlist: next.allowlist ?? allowlist,',
      },
    ],
    tests,
  },
  {
    name: 'a later allowlist cannot narrow the earlier one',
    edits: [
      {
        file: '../src/interpreter.ts',
        find: 'return new Set(Array.from(next).filter(key => current.has(key)))',
        replace: 'return current',
      },
    ],
    tests,
  },
]
