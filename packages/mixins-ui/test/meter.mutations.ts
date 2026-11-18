/**
 * The meter, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/meter.mutations.ts` checks that a
 * test fails for every one.
 */
const unit = 'packages/mixins-ui/test/meter.test.ts'
const browser = 'packages/mixins-ui/test/meter.browser.test.ts'

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
  {
    name: 'a large meter as thin as the middle one',
    edits: [
      {
        file: '../src/recipes/meter.ts',
        find: "lg: sized('0.75rem'),",
        replace: "lg: sized('0.5rem'),",
      },
    ],
    tests: [unit],
  },
  {
    name: 'a meter with no size picked is the large one',
    edits: [
      {
        file: '../src/recipes/meter.ts',
        find: "defaults: { size: 'md' },",
        replace: "defaults: { size: 'lg' },",
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'an upright meter does not say so',
    edits: [
      {
        file: '../src/meter.ts',
        find: "...(upright ? [h.DataAttribute('orientation', 'vertical')] : []),",
        replace: '',
      },
    ],
    tests: [unit],
  },
  {
    name: 'an upright fill is not given its share',
    edits: [
      {
        file: '../src/meter.ts',
        find: "...(upright ? { '--fk-meter-share': percentOf(value, options) } : {}),",
        replace: '',
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'a segment count of one is accepted',
    edits: [{ file: '../src/meter.ts', find: 'segments < 2))', replace: 'segments < 1))' }],
    tests: [unit],
  },
  {
    name: 'a segmented meter does not carry its count',
    edits: [
      {
        file: '../src/meter.ts',
        find: "...(segments === undefined ? {} : { '--fk-meter-segments': String(segments) }),",
        replace: '',
      },
    ],
    tests: [unit],
  },
  {
    name: 'an upright fill takes the inline width upstream writes',
    edits: [{ file: '../src/recipes/meter.ts', find: "minInlineSize: '100%',", replace: '' }],
    tests: [browser],
  },
  {
    name: 'an upright fill floats to the track start',
    edits: [{ file: '../src/recipes/meter.ts', find: "justifyContent: 'flex-end',", replace: '' }],
    tests: [browser],
  },
  {
    name: 'an upright track is cut across, not along',
    edits: [{ file: '../src/recipes/meter.ts', find: "cut('to top')", replace: "cut('to right')" }],
    tests: [browser],
  },
  {
    name: 'an upright track is as thick as the size says along its length',
    edits: [
      {
        file: '../src/recipes/meter.ts',
        find: 'inlineSize: thick,',
        replace: 'inlineSize: "1rem",',
      },
    ],
    tests: [browser],
  },
]
