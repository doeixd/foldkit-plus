/**
 * Swipe's release speed, broken in turn:
 * `pnpm mutate packages/primitives/test/swipe.mutations.ts` checks that a
 * test fails for every one.
 */
const unit = ['packages/primitives/test/swipe.test.ts']

export default [
  {
    name: 'the speed is the whole drag’s',
    edits: [
      {
        file: '../src/dom/swipe.ts',
        find: 'samples.find(sample => last.at - sample.at <= SWIPE_WINDOW) ?? last',
        replace: 'samples[0] ?? last',
      },
    ],
    tests: unit,
  },
  {
    name: 'the release’s own place and time are not a sample',
    edits: [
      {
        file: '../src/dom/swipe.ts',
        find: 'const all = completed ? [...samples, last] : samples',
        replace: 'const all = samples',
      },
    ],
    tests: unit,
  },
  {
    name: 'a cancel reports a speed',
    edits: [
      {
        file: '../src/dom/swipe.ts',
        find: 'const velocity = completed ? velocityOf(all) : { x: 0, y: 0 }',
        replace: 'const velocity = velocityOf(all)',
      },
    ],
    tests: unit,
  },
  {
    name: 'a second pointer moves the swipe',
    edits: [
      {
        file: '../src/dom/swipe.ts',
        find: '                if (active === null || active.pointerId !== pointerId) return\n                const sample',
        replace: '                if (active === null) return\n                const sample',
      },
    ],
    tests: unit,
  },
]
