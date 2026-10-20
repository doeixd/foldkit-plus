/**
 * The image, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/image.mutations.ts` checks that a
 * test fails for every one.
 */
const unit = ['packages/mixins-ui/test/image.test.ts']
const browser = ['packages/mixins-ui/test/image.browser.test.ts']

export default [
  {
    name: 'a source leaves out the img’s sizes',
    edits: [
      {
        file: '../src/image.ts',
        find: 'h.source([h.Type(source.type), h.Srcset(source.srcset), h.Sizes(img.sizes)])',
        replace: 'h.source([h.Type(source.type), h.Srcset(source.srcset)])',
      },
    ],
    tests: unit,
  },
  {
    name: 'a decorative image is announced',
    edits: [
      {
        file: '../src/image.ts',
        find: "Decorative: () => [h.Alt(''), h.Role('presentation')],",
        replace: "Decorative: () => [h.Alt('')],",
      },
    ],
    tests: unit,
  },
  {
    name: 'the placeholder is not painted',
    edits: [
      {
        file: '../src/recipes/image.ts',
        find: "background: 'var(--fk-image-placeholder) center / cover no-repeat',",
        replace: '',
      },
    ],
    tests: browser,
  },
  {
    name: 'an image is as wide as its width attribute, whatever its container',
    edits: [
      {
        file: '../src/recipes/image.ts',
        find: "maxInlineSize: '100%',\n        blockSize: 'auto',",
        replace: "blockSize: 'auto',",
      },
    ],
    tests: browser,
  },
  {
    name: 'an image’s height is its height attribute, whatever its width',
    edits: [{ file: '../src/recipes/image.ts', find: "blockSize: 'auto',", replace: '' }],
    tests: browser,
  },
  {
    name: 'a full-width image keeps its intrinsic width',
    edits: [
      {
        file: '../src/recipes/image.ts',
        find: `Style.nest('&[data-layout="full"]', { inlineSize: '100%' }),`,
        replace: '',
      },
    ],
    tests: browser,
  },
]
