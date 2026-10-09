/**
 * A mutation's live publish, broken in turn:
 * `pnpm mutate packages/remote-server/test/publish.mutations.ts`.
 */
const tests = ['packages/remote-server/test/liveHub.test.ts']
const server = '../src/index.ts'

export default [
  {
    name: 'nothing is published',
    edits: [{ file: server, find: 'if (hub !== undefined) {', replace: 'if (false) {' }],
    tests,
  },
  {
    name: 'a deletion is not published',
    edits: [
      {
        file: server,
        find: 'Effect.andThen(Effect.forEach(outcome.deleted, gone => hub.deleted(gone))),',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a failed publish fails the mutation',
    edits: [
      { file: server, find: 'Effect.catchCause(cause =>', replace: 'Effect.tapCause(cause =>' },
    ],
    tests,
  },
]
