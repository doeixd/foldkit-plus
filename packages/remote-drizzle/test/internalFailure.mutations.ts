/**
 * What a caller reads when a Drizzle-backed server fails (#573), each side of
 * the rule broken in turn: a driver's failure told as the adapter's own words,
 * and the adapter's own words about a caller's request withheld.
 * `pnpm mutate packages/remote-drizzle/test/internalFailure.mutations.ts`.
 */
const index = '../src/index.ts'
const tests = ['packages/remote-drizzle/test/internalFailure.test.ts']

export default [
  {
    name: 'a failed statement is told to its caller',
    edits: [
      {
        file: index,
        find: '    Effect.mapError(cause => new RemoteServerError({ message: failed, cause })),',
        replace: '    Effect.mapError(() => RemoteServer.tell(failed)),',
      },
    ],
    tests,
  },
  {
    name: 'a failed statement’s error is told to its caller',
    edits: [
      {
        file: index,
        find: '    Effect.mapError(cause => new RemoteServerError({ message: failed, cause })),',
        replace: '    Effect.mapError(cause => RemoteServer.tell(String(cause))),',
      },
    ],
    tests,
  },
  {
    name: 'a failed statement’s error is left out of the report',
    edits: [
      {
        file: index,
        find: '    Effect.mapError(cause => new RemoteServerError({ message: failed, cause })),',
        replace: '    Effect.mapError(() => new RemoteServerError({ message: failed })),',
      },
    ],
    tests,
  },
  {
    name: 'a lost cursor is withheld from the caller who sent it',
    edits: [
      {
        file: index,
        find: "const gone = RemoteServer.tell('The query cursor no longer resolves to a row')",
        replace:
          "const gone = new RemoteServerError({ message: 'The query cursor no longer resolves to a row' })",
      },
    ],
    tests,
  },
  {
    name: 'a window asking both ends is withheld from the caller who sent it',
    edits: [
      {
        file: index,
        find: "          return yield* RemoteServer.tell(\n            'A query window cannot combine after with before, or first with last',\n          )",
        replace:
          "          return yield* new RemoteServerError({ message: 'A query window cannot combine after with before, or first with last' })",
      },
    ],
    tests,
  },
  {
    name: 'a reused operation id is withheld from the caller who sent it',
    edits: [
      {
        file: index,
        find: '  const reused = (operation: string) =>\n    RemoteServer.tell(\n',
        replace:
          '  const reused = (operation: string) =>\n    ((message: string) => new RemoteServerError({ message }))(\n',
      },
    ],
    tests: ['packages/remote-drizzle/test/ledger.test.ts'],
  },
]
