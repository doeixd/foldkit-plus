/**
 * `RemoteServer.answer`'s defects, broken: `pnpm mutate packages/remote-server/test/answer.mutations.ts`.
 */
export default [
  {
    name: 'a defect answered "Internal error" is not handed on',
    edits: [
      { file: '../src/index.ts', find: 'onDefect(cause).pipe(', replace: 'Effect.void.pipe(' },
    ],
    tests: ['packages/remote-server/test/answer.test.ts'],
  },
]
