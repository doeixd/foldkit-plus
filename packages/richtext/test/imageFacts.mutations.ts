/**
 * An image's facts in the standard vocabulary, broken in turn:
 * `pnpm mutate packages/richtext/test/imageFacts.mutations.ts` checks that a
 * test fails for every one.
 */
const standard = '../src/standard.ts'
const tests = ['packages/richtext/test/standard.test.ts']

export default [
  {
    name: 'any facts are taken',
    edits: [
      {
        file: standard,
        find: 'asset: Schema.optional(ImageAsset),',
        replace: 'asset: Schema.optional(Schema.Unknown),',
      },
    ],
    tests,
  },
  {
    name: 'an image’s facts hold no box',
    edits: [{ file: standard, find: '...imageBox(block.props),', replace: '' }],
    tests,
  },
  {
    name: 'the box ignores the width the image is drawn at',
    edits: [
      {
        file: standard,
        find: "typeof drawn === 'number' && drawn > 0 ? drawn : width",
        replace: 'width',
      },
    ],
    tests,
  },
]
