/**
 * A link as an operand in SQL and in the memory server, broken in turn:
 * `pnpm mutate packages/remote-drizzle/test/link.mutations.ts`.
 */
const tests = ['packages/remote-drizzle/test/link.test.ts']
const compile = '../src/compile.ts'
const server = '../../remote-server/src/index.ts'

export default [
  {
    name: 'a link reads no column',
    edits: [
      {
        file: compile,
        find: '    return link.field\n',
        replace: '    return target.columns.id!\n',
      },
    ],
    tests,
  },
  {
    name: 'a link stored on the other table reads its foreign key',
    edits: [
      {
        file: compile,
        find: "    if (link.kind !== 'one') {\n      throw new QueryCompileError(",
        replace: '    if (false) {\n      throw new QueryCompileError(',
      },
    ],
    tests,
  },
  {
    name: 'the memory server compares a link as its ref key',
    edits: [
      {
        file: server,
        find: '                    .map(row => Held.fromRefs(body, row))',
        replace: '',
      },
    ],
    tests,
  },
]
