/**
 * The list's connection, broken: `pnpm mutate packages/crud/test/list.mutations.ts`.
 */
export default [
  {
    name: 'the connection is rebuilt from an empty input',
    edits: [
      {
        file: '../src/index.ts',
        find: 'Option.map(projectionOf(root), projection => projection.ref),',
        replace: 'Option.map(projectionOf(root), () => query.ref({})),',
      },
    ],
    tests: ['packages/crud/test/list.test.ts'],
  },
]
