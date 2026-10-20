/**
 * The browser inspector, broken in turn:
 * `pnpm mutate packages/media/test/inspect.mutations.ts` checks that a test
 * fails for every one.
 */
const inspector = '../src/browser/index.ts'
const tests = ['packages/media/test/inspect.browser.test.ts']

export default [
  {
    name: 'every image reads as opaque',
    edits: [{ file: inspector, find: 'alpha = pixels[at]! < 255', replace: 'alpha = false' }],
    tests,
  },
  {
    name: 'a picture of any size is drawn',
    edits: [
      { file: inspector, find: 'if (width * height > maxPixels) {', replace: 'if (false) {' },
    ],
    tests,
  },
  {
    name: 'what the browser cannot decode is a defect, not a refusal',
    edits: [
      {
        file: inspector,
        find: 'catch: () => new TransformFailed({}),',
        replace: 'catch: cause => cause as never,',
      },
    ],
    tests,
  },
  {
    name: 'the thumbnail is drawn at full size',
    edits: [
      {
        file: inspector,
        find: 'const scale = Math.min(1, THUMBNAIL_SIDE / Math.max(width, height))',
        replace: 'const scale = 1',
      },
    ],
    tests,
  },
  {
    name: 'only the first tile is read for alpha',
    edits: [
      {
        file: inspector,
        find: 'for (let top = 0; top < height && !alpha; top += ALPHA_TILE_SIDE)',
        replace: 'for (let top = 0; top < 1 && !alpha; top += ALPHA_TILE_SIDE)',
      },
      {
        file: inspector,
        find: 'for (let left = 0; left < width && !alpha; left += ALPHA_TILE_SIDE)',
        replace: 'for (let left = 0; left < 1 && !alpha; left += ALPHA_TILE_SIDE)',
      },
    ],
    tests,
  },
]
