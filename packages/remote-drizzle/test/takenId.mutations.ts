/**
 * A create of a taken id answered as a `Taken` refusal, each step broken in
 * turn: `pnpm mutate packages/remote-drizzle/test/takenId.mutations.ts`
 * checks that a test fails for every one. The first runs once per dialect's
 * tests, so each shows its own dialect refusing.
 */
const drizzle = '../src/index.ts'
const server = '../../remote-server/src/index.ts'
const mutation = '../../remote/src/mutation.ts'

const asServerError = {
  file: drizzle,
  find: 'onNone: () => Effect.fail(RemoteServer.taken(`${binding.name} ${id} is already taken`)),',
  replace:
    'onNone: () => Effect.fail(new RemoteServerError({ message: `${binding.name} ${id} is already taken` })),',
}

export default [
  ...[
    ['SQLite and Postgres, ledgered', 'packages/remote-drizzle/test/ledger.test.ts'],
    ['SQLite and Postgres, unledgered', 'packages/remote-drizzle/test/writer.test.ts'],
    ['D1', 'packages/remote-drizzle/test/d1.test.ts'],
    ['a guarded writer', 'packages/guard/test/write.test.ts'],
  ].map(([where, test]) => ({
    name: `${where}: a taken id is the server's error, as before`,
    edits: [asServerError],
    tests: [test!],
  })),
  {
    name: 'RemoteServer.write does not answer a writer that says taken',
    edits: [
      {
        file: server,
        find: "Effect.catchTag('RemoteTaken', () =>",
        replace: "Effect.catchTag('RemoteTakenNot', () =>",
      },
    ],
    tests: ['packages/remote-drizzle/test/takenId.test.ts'],
  },
  {
    name: 'a taken id is answered 422 over HTTP',
    edits: [
      {
        file: server,
        find: 'status: Refusal.isTaken(error.refusal) ? (409 as const) : (422 as const),',
        replace: 'status: 422 as const,',
      },
    ],
    tests: ['packages/remote-drizzle/test/takenId.test.ts'],
  },
  {
    name: "a declared insert's Refusal does not hold Taken",
    edits: [
      {
        file: mutation,
        find: 'Insert: (): Schema.Top => takenOrInvalid,',
        replace: 'Insert: (): Schema.Top => conflictOrInvalid,',
      },
    ],
    tests: ['packages/remote-drizzle/test/takenId.test.ts'],
  },
]
