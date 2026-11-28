/**
 * Mutation specification for `Operation.derived` & `Operation.expandDerived`.
 */
const tests = ['packages/metakit/test/derivedOperation.test.ts']

export default [
  {
    name: 'Operation.derived skips missing paramOrder check',
    edits: [
      {
        file: '../src/operation.ts',
        find: '  if (seen.size !== expectedKeys.length) {',
        replace: '  if (false && seen.size !== expectedKeys.length) {',
      },
    ],
    tests,
  },
  {
    name: 'Operation.expandDerived skips maxNodes budget check',
    edits: [
      {
        file: '../src/operation.ts',
        find: '    if (budget > maxNodes) {',
        replace: '    if (false && budget > maxNodes) {',
      },
    ],
    tests,
  },
]
