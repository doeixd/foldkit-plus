/**
 * The progress, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/progress.mutations.ts` checks that a
 * test fails for every one.
 */
const unit = 'packages/mixins-ui/test/progress.test.ts'

export default [
  {
    name: 'the share runs past the end',
    edits: [
      {
        file: '../src/progress.ts',
        find: 'Math.min(1, Math.max(0, (value - min) / (max - min)))',
        replace: 'Math.max(0, (value - min) / (max - min))',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a range of no width divides by zero',
    edits: [{ file: '../src/progress.ts', find: 'max <= min ? 1 : ', replace: '' }],
    tests: [unit],
  },
  {
    name: 'the share is measured from zero',
    edits: [
      {
        file: '../src/progress.ts',
        find: 'fraction(value, options.min, options.max)',
        replace: 'fraction(value, 0, options.max)',
      },
    ],
    tests: [unit],
  },
  {
    name: 'an unknown end gets a share',
    edits: [
      {
        file: '../src/progress.ts',
        find: 'Option.map(options.value, value => fraction(value, options.min, options.max))',
        replace:
          'Option.some(fraction(Option.getOrElse(options.value, () => 0), options.min, options.max))',
      },
    ],
    tests: [unit],
  },
  {
    name: 'the range stops at upstream',
    edits: [
      {
        file: '../src/progress.ts',
        find: '...(options.max === undefined ? {} : { max: options.max }),',
        replace: '',
      },
    ],
    tests: [unit],
  },
  {
    name: 'the ring reads a share nobody writes',
    edits: [
      {
        file: '../src/recipes/progress.ts',
        find: 'calc(var(--fk-progress, 0) * 1turn)',
        replace: 'calc(var(--fk-progress-share, 0) * 1turn)',
      },
    ],
    tests: [unit],
  },
]
