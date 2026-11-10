/**
 * A live stream is the principal's: `forget` moves the floor and the stream
 * restarts at cursor zero. `pnpm mutate packages/remote/test/liveFloor.mutations.ts`.
 */
export default [
  {
    name: 'forget does not restart a live entry',
    edits: [
      { file: '../src/liveEntry.ts', find: 'floor: remote.refresh.floor,', replace: 'floor: 0,' },
    ],
    tests: ['packages/remote/test/forget.test.ts'],
  },
]
