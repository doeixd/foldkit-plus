/**
 * `and`, `or` and `not` compiled to SQL, and a field-free operand settled per
 * request, broken in turn: `pnpm mutate packages/remote-drizzle/test/logic.mutations.ts`
 * checks that a test fails for every one.
 */
const compile = '../src/compile.ts'
const lowering = '../src/lowering.ts'
const sqlLowering = '../../metakit/src/sqlLowering.ts'
const tests = [
  'packages/remote-drizzle/test/compile.test.ts',
  'packages/remote-drizzle/test/conformance.test.ts',
  'packages/remote-drizzle/test/lowering.test.ts',
]

const rewrites = '../src/rewrites.ts'

export default [
  {
    name: 'nothing is settled: the request is not bound into the translation',
    edits: [
      {
        file: lowering,
        find: '    envFor(node, lowered, target, input),\n    readsStored',
        replace: '    {},\n    readsStored',
      },
    ],
    tests,
  },
  {
    name: 'a field written second keeps its operator',
    edits: [{ file: rewrites, find: "'ord.gt': 'ord.lt',", replace: "'ord.gt': 'ord.gt'," }],
    tests,
  },
  {
    name: 'a comparison ignores its collation',
    edits: [
      {
        file: rewrites,
        find: '  if (column === undefined) return node\n',
        replace: '  return node\n',
      },
    ],
    tests,
  },
  {
    name: 'lt is written as lte',
    edits: [
      {
        file: sqlLowering,
        find: "'ord.lt': numeric(() => '<'),",
        replace: "'ord.lt': numeric(() => '<='),",
      },
    ],
    tests,
  },
  {
    name: 'a predicate that reads no field is sent to the database',
    edits: [
      {
        file: compile,
        find: "  return Node.$is('Lit')(residual)\n",
        replace: '  return false\n',
      },
    ],
    tests,
  },
  {
    name: 'a not compiles to its operand',
    edits: [
      {
        file: sqlLowering,
        find: "'bool.not': (args, ctx) => one(args, ctx, inner => q`(NOT ${inner})`),",
        replace: "'bool.not': (args, ctx) => one(args, ctx, inner => q`(${inner})`),",
      },
    ],
    tests,
  },
  {
    name: 'an or compiles as an and',
    edits: [
      { file: sqlLowering, find: "'bool.or': infix('OR'),", replace: "'bool.or': infix('AND')," },
    ],
    tests,
  },
]
