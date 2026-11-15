/**
 * `Law.check` deciding what it leaves to the server, broken in turn:
 * `pnpm mutate packages/remote/test/lawJudged.mutations.ts`.
 */
const tests = ['packages/remote/test/lawJudged.test.ts']

export default [
  {
    name: 'a server Invalid is left to the server whenever Data.can is undecided',
    edits: [
      {
        file: '../src/law.ts',
        find: "{ onNone: () => true, onSome: judged => judged._tag === 'Undecided' },",
        replace:
          "{ onNone: () => true, onSome: () => Data.can(model, config.mutation, config.input as never)._tag === 'Undecided' },",
      },
    ],
    tests,
  },
]
