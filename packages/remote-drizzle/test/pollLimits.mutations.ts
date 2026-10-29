/**
 * `pollLive` under the handlers' limits, broken in turn:
 * `pnpm mutate packages/remote-drizzle/test/pollLimits.mutations.ts`
 */
export default [
  {
    name: 'each subscribed row is read with its own fields, one read a row',
    edits: [
      {
        file: '../src/poll.ts',
        find: 'const answered = ids.length === 0 ? Option.none() : yield* read(ids, fields)',
        replace:
          'const answered = ids.length === 0 ? Option.none() : Option.some((yield* Effect.forEach(ids, id => read([id], asked.get(id) ?? []))).flatMap(one => Option.getOrElse(one, () => [])))',
      },
    ],
    tests: ['packages/remote-drizzle/test/pollLimits.test.ts'],
  },
]
