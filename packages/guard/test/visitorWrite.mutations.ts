/**
 * A visitor's refused write asks for a sign-in (#403), broken in turn:
 * `pnpm mutate packages/guard/test/visitorWrite.mutations.ts`.
 */
const tests = ['packages/guard/test/write.test.ts']

export default [
  {
    name: 'a visitor refused by a rule is Forbidden',
    edits: [
      {
        file: '../src/server.ts',
        find: 'Option.isSome(principal)\n    ? write',
        replace: 'true\n    ? write',
      },
    ],
    tests,
  },
  {
    name: 'a visitor with nothing to set who asks from is Forbidden',
    edits: [
      {
        file: '../../remote-server/src/index.ts',
        find: 'const unfilled = Option.isNone(viewer)',
        replace: 'const unfilled = false',
      },
    ],
    tests,
  },
]
