/**
 * Each index a page needs, dropped in turn (#437):
 * `pnpm mutate examples/chirp/test/queryPlans.mutations.ts`.
 */
const tests = ['examples/chirp/test/queryPlans.test.ts']
const server = '../src/server/server.ts'

export default [
  {
    name: 'no index holds the newest-first order',
    edits: [
      {
        file: server,
        find: '  create index posts_newest on posts (created_at desc, id);\n',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'the index runs oldest first',
    edits: [
      { file: server, find: 'posts (created_at desc, id)', replace: 'posts (created_at, id)' },
    ],
    tests,
  },
]
