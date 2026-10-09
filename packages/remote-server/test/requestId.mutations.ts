/**
 * A mutation's request id, broken in turn:
 * `pnpm mutate packages/remote-server/test/requestId.mutations.ts`.
 */
export default [
  {
    name: 'the Source is given a fixed id, not the client’s',
    edits: [
      {
        file: '../src/index.ts',
        find: '.run({ input, principal, requestId: payload.requestId })',
        replace: ".run({ input, principal, requestId: 'r' })",
      },
    ],
    tests: ['packages/remote-server/test/server.test.ts'],
  },
  {
    name: 'a publish names no entry or revision',
    edits: [
      {
        file: '../../cms-drizzle/src/index.ts',
        find: "requestId: `publish:${entry.id}:${held ?? 'new'}`,",
        replace: "requestId: 'publish',",
      },
    ],
    tests: ['packages/cms-drizzle/test/drafts.test.ts'],
  },
]
