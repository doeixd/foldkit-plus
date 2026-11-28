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
  {
    name: 'Operation.expandDerived drops the result guard',
    edits: [
      {
        file: '../src/operation.ts',
        find: '        for (const rule of resultExact.rules) {',
        replace: '        for (const rule of [] as typeof resultExact.rules) {',
      },
    ],
    tests,
  },
  {
    name: 'Operation.expandDerived drops the argument guard',
    edits: [
      {
        file: '../src/operation.ts',
        find: '        for (let i = 0; i < argExact.length; i++) {\n          const argNode = expandedArgs[i]!',
        replace:
          '        for (let i = 0; i < 0; i++) {\n          const argNode = expandedArgs[i]!',
      },
    ],
    tests,
  },
  {
    name: 'Operation.expandDerived skips the unread-check test',
    edits: [
      {
        file: '../src/operation.ts',
        find: '        if (!canDischargeUnread(resultExact.unread, expandedBody)) {',
        replace: '        if (false && !canDischargeUnread(resultExact.unread, expandedBody)) {',
      },
    ],
    tests,
  },
]
