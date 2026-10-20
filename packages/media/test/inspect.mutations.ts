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
    edits: [{ file: inspector, find: 'alpha = rgba[at]! < 255', replace: 'alpha = false' }],
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
]
