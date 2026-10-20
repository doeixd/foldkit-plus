/** Resource caps, broken in turn: the public adapters must refuse each invalid value. */
export default [
  {
    name: 'a non-integer resource cap is accepted',
    edits: [
      {
        file: '../src/limits.ts',
        find: 'if (!Number.isSafeInteger(value) || value < 0) {',
        replace: 'if (false) {',
      },
    ],
    tests: ['packages/media/test/limits.test.ts'],
  },
  {
    name: 'an unsafe concurrency is accepted',
    edits: [
      {
        file: '../src/limits.ts',
        find: 'if (!Number.isSafeInteger(value) || value < 1) {',
        replace: 'if (false) {',
      },
    ],
    tests: ['packages/media/test/limits.test.ts'],
  },
]
