/**
 * The line that says whether edits reached the server, broken in turn: `pnpm mutate
 * examples/pages/test/saved.mutations.ts`.
 */
const file = '../src/app.ts'
const tests = ['examples/pages/test/pages.test.ts']

export default [
  {
    name: 'every status is a new Model, so every exchange renders',
    edits: [
      {
        file,
        find: 'pending === model.exchange.pending && Equal.equals(error, model.exchange.error)',
        replace: 'false',
      },
    ],
    tests,
  },
  {
    name: 'a status whose error cleared is taken for the one before',
    edits: [{ file, find: 'Equal.equals(error, model.exchange.error)', replace: 'true' }],
    tests,
  },
  {
    name: 'an error is not said while edits are waiting',
    edits: [
      {
        file,
        find: '`Offline: ${edits} kept in this tab until the server is back.`',
        replace: "'Offline: the server cannot be reached.'",
      },
    ],
    tests,
  },
  {
    name: 'edits waiting on a working server read as saved',
    edits: [
      {
        file,
        find: "pending === 0\n        ? { state: 'saved'",
        replace: "true\n        ? { state: 'saved'",
      },
    ],
    tests,
  },
]
