/**
 * decodeImage, broken in turn:
 * `pnpm mutate packages/primitives/test/image-decode.mutations.ts` checks
 * that a test fails for every one.
 */
const tests = ['packages/primitives/test/image-decode.browser.test.ts']

export default [
  {
    name: 'the candidates are ignored',
    edits: [
      {
        file: '../src/dom/image-decode.ts',
        find: 'if (source.srcset !== undefined) image.srcset = source.srcset',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a failure reads as decoded',
    edits: [
      {
        file: '../src/dom/image-decode.ts',
        find: 'Effect.succeed(ImageDecodeMessage.DecodeFailed({ src: source.src, message })),',
        replace: 'Effect.succeed(ImageDecodeMessage.Decoded({ src: source.src })),',
      },
    ],
    tests,
  },
]
