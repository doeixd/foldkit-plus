/**
 * The journal exchange's own gates, broken in turn:
 * `pnpm mutate packages/sync/test/exchange.mutations.ts`.
 */
const tests = ['packages/sync/test/journal.test.ts']
const file = '../src/journal.ts'

export default [
  {
    name: 'a connection that may not open the document exchanges anyway',
    edits: [
      {
        file,
        find: 'if (options.opens !== undefined && !(yield* options.opens)) {',
        replace: 'if (false) {',
      },
    ],
    tests,
  },
  {
    name: 'every operation is admitted',
    edits: [{ file, find: 'if (decision !== true) {', replace: 'if (false) {' }],
    tests,
  },
  {
    name: 'an admission decided as an Effect is not waited for',
    edits: [
      {
        file,
        find: 'const decision = Effect.isEffect(admitted) ? yield* admitted : admitted',
        replace: 'const decision = Effect.isEffect(admitted) ? true : admitted',
      },
    ],
    tests,
  },
  {
    name: 'a refusal’s reason is not sent',
    edits: [
      {
        file,
        find: "decision === false ? 'This connection may not make changes' : decision.reason,",
        replace: "'This connection may not make changes',",
      },
    ],
    tests,
  },
]
