/**
 * A dying client call is heard as a failure, each call site in turn left
 * unguarded: `pnpm mutate packages/remote/test/clientDefect.mutations.ts`.
 * The outbox's send is not here: unguarded, other tests in `outbox.test.ts`
 * wait on a dead sender for good and the run hangs. Mutated by hand, its
 * test there ("whose send dies, settles failed") fails in 36 ms.
 */
const tests = ['packages/remote/test/clientDefect.test.ts']

export default [
  {
    name: 'a dying read sends nothing',
    edits: [
      {
        file: '../src/domain.ts',
        find: 'defectAsFailure(\n        client.read({',
        replace: '(<A>(read: A): A => read)(\n        client.read({',
      },
    ],
    tests,
  },
  {
    name: 'a dying list sends nothing',
    edits: [
      {
        file: '../src/domain.ts',
        find: 'defectAsFailure(queryRequestOf(query)',
        replace: '(queryRequestOf(query)',
      },
    ],
    tests,
  },
  {
    name: 'a dying write sends nothing',
    edits: [
      {
        file: '../src/writes.ts',
        find: ': defectAsFailure(\n',
        // An identity call, since oxfmt leaves a trailing comma the bare parenthesis cannot take.
        replace: ': (<A>(effect: A) => effect)(\n',
      },
    ],
    tests,
  },
  {
    name: 'a defect loses what it said',
    edits: [
      {
        file: '../src/client.ts',
        find: 'message: defect instanceof Error ? defect.message : String(defect),',
        replace: "message: 'a defect',",
      },
    ],
    tests,
  },
]
