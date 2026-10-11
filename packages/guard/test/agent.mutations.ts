/**
 * An agent's capability gated by `may`, broken in turn:
 * `pnpm mutate packages/guard/test/agent.mutations.ts`.
 */
const file = '../src/agent.ts'
const tests = ['packages/guard/test/agent.test.ts']

export default [
  {
    name: 'a row being read again has no answer',
    edits: [
      {
        file,
        find: 'Refreshing: ({ may }) => Option.some(may),',
        replace: 'Refreshing: () => Option.none(),',
      },
    ],
    tests,
  },
  {
    name: 'a failed read answers with what it last knew',
    edits: [
      {
        file,
        find: 'Failed: () => Option.none(),',
        replace: 'Failed: (_, previous) => Option.map(previous, ({ may }) => may),',
      },
    ],
    tests,
  },
  {
    name: 'every interaction is read as an update',
    edits: [{ file, find: 'May.can(may, interaction)', replace: "May.can(may, 'Update')" }],
    tests,
  },
  {
    name: 'a capability is always offered',
    edits: [
      {
        file,
        find: 'decided(row(model), interaction) === true,',
        replace: 'true,',
      },
    ],
    tests,
  },
  {
    name: 'a refusal its rule explained gives no reason',
    edits: [
      {
        file,
        find: 'onSome: reason => ({ allowed: false as const, reason }),',
        replace: 'onSome: () => false,',
      },
    ],
    tests,
  },
]
