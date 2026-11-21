/**
 * The Drizzle query source's handling of what a request asks, broken in turn:
 * `pnpm mutate packages/remote-drizzle/test/compile.mutations.ts` checks that a
 * test fails for every one.
 */
const tests = ['packages/remote-drizzle/test/compile.test.ts']
const file = '../src/index.ts'
export default [
  {
    name: 'a search the SQL cannot hold fails the request as a defect',
    edits: [
      {
        file,
        find: '      if (error instanceof QueryCompileError)\n',
        replace: '      if (false)\n',
      },
    ],
    tests,
  },
  {
    name: 'Postgres folds text by its collation',
    edits: [
      {
        file: '../../metakit/src/sqlLowering.ts',
        find: 'one(args, ctx, s => (ctx.dialect === \'postgres\' ? q`lower(${s} COLLATE "C")` : q`lower(${s})`)),',
        replace: 'one(args, ctx, s => q`lower(${s})`),',
      },
    ],
    tests: ['packages/remote-drizzle/test/conformance.test.ts'],
  },
  {
    name: 'a refusal of the request’s values is bound as a value',
    edits: [
      {
        file: '../src/lowering.ts',
        find: "if (Node.$is('Lit')(each) && Node.isRefusal(each.value)) return each.value",
        replace: 'if (false) return each.value',
      },
    ],
    tests: ['packages/remote-drizzle/test/conformance.test.ts', ...tests],
  },
  {
    name: 'what metakit refuses of a literal is written anyway',
    edits: [
      {
        file: '../src/render.ts',
        find: 'if (Result.isFailure(result)) {\n    throw new QueryCompileError(`${subject}',
        replace: 'if (false) {\n    throw new QueryCompileError(`${subject}',
      },
    ],
    tests: ['packages/remote-drizzle/test/conformance.test.ts', ...tests],
  },
]
