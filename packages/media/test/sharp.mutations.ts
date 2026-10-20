/**
 * The Node host: sharp and the transform limit, broken in turn:
 * `pnpm mutate packages/media/test/sharp.mutations.ts` checks that a
 * test fails for every one.
 */
export default [
  {
    name: 'transforms are not limited',
    edits: [
      {
        file: '../src/server/services.ts',
        find: 'Semaphore.withPermit(permits)(inner.transform(original, variant))',
        replace: 'inner.transform(original, variant)',
      },
    ],
    tests: ['packages/media/test/sharp.test.ts'],
  },
  {
    name: 'sharp decodes an original of any size',
    edits: [
      {
        file: '../src/sharp/index.ts',
        find: 'if (width * height > maxPixels) {',
        replace: 'if (false) {',
      },
    ],
    tests: ['packages/media/test/sharp.test.ts'],
  },
  {
    name: 'sharp enlarges',
    edits: [
      {
        file: '../src/sharp/index.ts',
        find: '.resize({ width: variant.width, withoutEnlargement: true })',
        replace: '.resize({ width: variant.width })',
      },
    ],
    tests: ['packages/media/test/sharp.test.ts'],
  },
  {
    name: 'sharp ignores the quality',
    edits: [
      {
        file: '../src/sharp/index.ts',
        find: 'onSome: quality => ({ quality })',
        replace: 'onSome: () => ({})',
      },
    ],
    tests: ['packages/media/test/sharp.test.ts'],
  },
]
