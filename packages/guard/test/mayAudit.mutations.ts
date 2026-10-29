/**
 * What `may` tells a reader (#284), broken in turn:
 * `pnpm mutate packages/guard/test/mayAudit.mutations.ts`.
 */
const tests = ['packages/guard/test/mayAudit.test.ts']

export default [
  {
    name: 'a write lands past its rules, as its stale may said it could',
    edits: [
      {
        file: './mayAudit.test.ts',
        find: 'GuardServer.writer(Todo, Policy, writer(Db.Todo))',
        replace: 'writer(Db.Todo)',
      },
    ],
    tests,
  },
  {
    name: 'a row its reader cannot see is read with its may',
    edits: [
      {
        file: './mayAudit.test.ts',
        find: 'entities: [source(Db.Todo, {',
        replace: 'entities: [source({ ...Db.Todo, visible: undefined }, {',
      },
    ],
    tests,
  },
  {
    name: 'may names only what its reader may do',
    edits: [
      {
        file: '../src/may.ts',
        find: 'onSome: answer => [{ interaction, rule, answer }],',
        replace: 'onSome: answer => (answer ? [{ interaction, rule, answer }] : []),',
      },
    ],
    tests,
  },
  {
    name: 'a reason is worded on the server',
    edits: [
      {
        file: '../src/may.ts',
        find: 'Explain: ({ reason }) => [[interaction, reason] as const],',
        replace: "Explain: () => [[interaction, 'Refused by isAdmin'] as const],",
      },
    ],
    tests,
  },
  {
    name: 'a Source may share may',
    edits: [
      {
        file: '../src/server.ts',
        find: "shared.includes('may') && asksMay(entity, ['may'])",
        replace: 'false',
      },
    ],
    tests,
  },
]
