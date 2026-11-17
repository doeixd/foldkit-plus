/**
 * The contrast arithmetic, broken in turn:
 * `pnpm mutate examples/design-system/test/contrast.mutations.ts`.
 */
const unit = ['examples/design-system/test/contrast.test.ts']

export default [
  {
    name: 'the lighter colour is not put over the darker',
    edits: [
      {
        file: '../src/contrast.ts',
        find: '[luminance(a), luminance(b)].sort((x, y) => y - x)',
        replace: '[luminance(a), luminance(b)]',
      },
    ],
    tests: unit,
  },
  {
    name: 'green and red weigh the same',
    edits: [
      {
        file: '../src/contrast.ts',
        find: '0.7152 * channel(green)',
        replace: '0.2126 * channel(green)',
      },
    ],
    tests: unit,
  },
  {
    name: 'a channel is not linearised',
    edits: [
      { file: '../src/contrast.ts', find: ': ((unit + 0.055) / 1.055) ** 2.4', replace: ': unit' },
    ],
    tests: unit,
  },
  {
    name: 'AA starts below 4.5',
    edits: [{ file: '../src/contrast.ts', find: 'value >= 4.5 ? ', replace: 'value >= 4.4 ? ' }],
    tests: unit,
  },
]
