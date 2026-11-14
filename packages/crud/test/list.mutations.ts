/**
 * The list's connection and its live read, broken: `pnpm mutate packages/crud/test/list.mutations.ts`.
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
  {
    name: 'a list given `live` is read like any other',
    edits: [{ file: '../src/index.ts', find: 'live === undefined', replace: 'true' }],
    tests: ['packages/crud/test/list.test.ts'],
  },
  {
    name: 'every list is read live',
    edits: [
      {
        file: '../src/index.ts',
        find: 'live === undefined',
        replace: 'false',
      },
      {
        file: '../src/index.ts',
        find: ': live<Root>(data,',
        replace: ': (live ?? liveRead)<Root>(data,',
      },
      {
        file: '../src/index.ts',
        find: "import type { liveQuery } from 'foldkit-remote/live'",
        replace: "import { liveQuery, liveQuery as liveRead } from 'foldkit-remote/live'",
      },
    ],
    tests: ['packages/crud/test/list.test.ts'],
  },
]
