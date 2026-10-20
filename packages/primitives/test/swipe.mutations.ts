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
        find: 'const all = completed ? [...samples, final] : samples',
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
        find: 'if (active === null || active.pointerId !== (pointer.pointerId ?? 0)) return',
        replace: 'if (active === null) return',
      },
    ],
    tests: unit,
  },
  {
    name: 'a slop is ignored',
    edits: [
      {
        file: '../src/dom/swipe.ts',
        find: 'if (slop <= 0) begin(active, true)',
        replace: 'begin(active, true)',
      },
    ],
    tests: unit,
  },
  {
    name: 'a press within the slop still ends a swipe',
    edits: [{ file: '../src/dom/swipe.ts', find: 'if (!started) return', replace: '' }],
    tests: unit,
  },
]
