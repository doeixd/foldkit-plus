/**
 * The meter, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/meter.mutations.ts` checks that a
 * test fails for every one.
 */
const unit = 'packages/mixins-ui/test/meter.test.ts'

export default [
  {
    name: 'low itself is in the low region',
    edits: [{ file: '../src/meter.ts', find: '(x < low ? 0 :', replace: '(x <= low ? 0 :' }],
    tests: [unit],
  },
  {
    name: 'high itself is in the high region',
    edits: [{ file: '../src/meter.ts', find: 'x > high ? 2 : 1', replace: 'x >= high ? 2 : 1' }],
    tests: [unit],
  },
  {
    name: 'the value is judged unclamped',
    edits: [
      { file: '../src/meter.ts', find: 'region(within(value, min))', replace: 'region(value)' },
    ],
    tests: [unit],
  },
  {
    name: 'the optimum defaults to the top',
    edits: [
      {
        file: '../src/meter.ts',
        find: 'thresholds.optimum ?? (min + max) / 2',
        replace: 'thresholds.optimum ?? max',
      },
    ],
    tests: [unit],
  },
  {
    name: 'two regions away is only fair',
    edits: [
      {
        file: '../src/meter.ts',
        find: "return away === 1 ? 'fair' : 'poor'",
        replace: "return 'fair'",
      },
    ],
    tests: [unit],
  },
  {
    name: 'the view judges without its thresholds',
    edits: [
      { file: '../src/meter.ts', find: 'levelOf(value, options)', replace: 'levelOf(value, {})' },
    ],
    tests: [unit],
  },
  {
    name: 'the range stops at upstream',
    edits: [
      { file: '../src/meter.ts', find: '...(min === undefined ? {} : { min }),', replace: '' },
      { file: '../src/meter.ts', find: '...(max === undefined ? {} : { max }),', replace: '' },
    ],
    tests: [unit],
  },
  {
    name: 'the spoken value stops at upstream',
    edits: [
      {
        file: '../src/meter.ts',
        find: '...(valueText === undefined ? {} : { valueText }),',
        replace: '',
      },
    ],
    tests: [unit],
  },
]
