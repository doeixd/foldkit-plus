/**
 * A relation cursor placed under the relation's policy (#290), broken in turn:
 * `pnpm mutate packages/remote-drizzle/test/relationCursorPolicy.mutations.ts`.
 */
const tests = ['packages/remote-drizzle/test/relationCursorPolicy.test.ts']
const source = '../src/index.ts'

export default [
  {
    name: 'a relation cursor is looked up under the Read rule alone',
    edits: [
      {
        file: source,
        find: 'where: and(eq(targetId, cursorId(shape.cursor)), policyWhere),',
        replace: 'where: and(eq(targetId, cursorId(shape.cursor)), targetVisible),',
      },
    ],
    tests,
  },
  {
    name: 'a through relation cursor is looked up without its target joined',
    edits: [
      {
        file: source,
        find: 'policyWhere),\n                innerJoin: side.join,',
        replace: 'policyWhere),',
      },
    ],
    tests,
  },
]
