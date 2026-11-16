/**
 * `RemoteServer.answer`'s defects, broken: `pnpm mutate packages/remote-server/test/answer.mutations.ts`.
 */
export default [
  {
    name: 'a defect answered "Internal error" is not reported',
    edits: [
      {
        file: '../src/diagnostics.ts',
        find: 'return Effect.as(Diagnostics.report(defect), { message: INTERNAL_ERROR, incident })',
        replace: 'return Effect.succeed({ message: INTERNAL_ERROR, incident })',
      },
    ],
    tests: ['packages/remote-server/test/answer.test.ts'],
  },
]
