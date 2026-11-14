/**
 * The command id written and read in one place, broken in turn:
 * `pnpm mutate packages/remote-domain/test/commandId.mutations.ts`.
 */
const tests = ['packages/remote-domain/test/commandId.test.ts']

export default [
  {
    name: 'the id is written with another separator than it is read with',
    edits: [
      {
        file: '../src/commandId.ts',
        find: '`${mutation}:${operation}:${digest}`',
        replace: '`${mutation}:${operation}/${digest}`',
      },
    ],
    tests,
  },
  {
    name: 'an operation holding a colon is cut at its first',
    edits: [
      { file: '../src/commandId.ts', find: "rest.lastIndexOf(':')", replace: "rest.indexOf(':')" },
    ],
    tests,
  },
  {
    name: 'any digest is taken',
    edits: [
      { file: '../src/commandId.ts', find: 'at > 0 && DIGEST.test(digest)', replace: 'at > 0' },
    ],
    tests,
  },
  {
    name: 'an empty operation is taken',
    edits: [
      { file: '../src/commandId.ts', find: 'at > 0 && DIGEST', replace: 'at >= 0 && DIGEST' },
    ],
    tests,
  },
]
