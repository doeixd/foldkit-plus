/**
 * `Frames.track`, each broken in turn: `pnpm mutate packages/mixins/test/frames.mutations.ts` checks that a
 * test fails for every one.
 */
export default [
  {
    name: 'settle returns at once',
    edits: [
      {
        file: '../src/testing.ts',
        find: '      for (let round = 0; round < rounds; round++) {',
        replace: '      return\n      for (let round = 0; round < rounds; round++) {',
      },
    ],
    tests: ['packages/mixins/test/frames.test.ts'],
  },
  {
    name: 'settle waits for one frame only',
    edits: [
      {
        file: '../src/testing.ts',
        find: '          await aFrame()\n          continue',
        replace: '          await aFrame()\n          return',
      },
    ],
    tests: ['packages/mixins/test/frames.test.ts'],
  },
  {
    name: "settle always waits a frame's time",
    edits: [
      {
        file: '../src/testing.ts',
        find: '        await turn()\n        if (waiting.size === 0) return',
        replace:
          '        await new Promise(resolve => setTimeout(resolve, 400))\n        if (waiting.size === 0) return',
      },
    ],
    tests: ['packages/mixins/test/frames.test.ts'],
  },
  {
    name: 'hold holds nothing',
    edits: [
      {
        file: '../src/testing.ts',
        find: '      holding = true\n',
        replace: '      holding = false\n',
      },
    ],
    tests: ['packages/mixins/test/frames.test.ts'],
  },
]
