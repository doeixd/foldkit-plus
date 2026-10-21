/**
 * The image, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/image.mutations.ts` checks that a
 * test fails for every one.
 */
const unit = ['packages/mixins-ui/test/image.test.ts']
const browser = ['packages/mixins-ui/test/image.browser.test.ts']

export default [
  {
    name: 'a blurry image goes unremarked',
    edits: [
      {
        file: '../src/image.ts',
        find: 'if (image.naturalWidth < drawn * BLURRY_BELOW)',
        replace: 'if (false)',
      },
    ],
    tests: browser,
  },
  {
    name: 'a wasteful image goes unremarked',
    edits: [
      {
        file: '../src/image.ts',
        find: 'if (image.naturalWidth > drawn * WASTED_ABOVE)',
        replace: 'if (false)',
      },
    ],
    tests: browser,
  },
  {
    name: 'a second priority image goes unremarked',
    edits: [
      { file: '../src/image.ts', find: 'if (prioritized.size > 1) {', replace: 'if (false) {' },
    ],
    tests: browser,
  },
  {
    name: 'an img holds no box before its file arrives',
    edits: [
      { file: '../src/imageAttributes.ts', find: '  h.Width(String(img.width)),\n', replace: '' },
      { file: '../src/imageAttributes.ts', find: '  h.Height(String(img.height)),\n', replace: '' },
    ],
    tests: browser,
  },
  {
    name: 'a ratio does not crop the image',
    edits: [
      {
        file: '../src/recipes/image.ts',
        find: 'image: variant(Style.self({ aspectRatio: ratio })),',
        replace: 'image: variant(Style.self({})),',
      },
    ],
    tests: browser,
  },
  {
    name: 'an unavailable image ignores the ratio',
    edits: [
      {
        file: '../src/recipes/image.ts',
        find: "frame: variant(Style.nest('&[data-unavailable]', { aspectRatio: ratio })),",
        replace: 'frame: variant(Style.self({})),',
      },
    ],
    tests: browser,
  },
  {
    name: 'a radius rounds nothing',
    edits: [
      {
        file: '../src/recipes/image.ts',
        find: 'variant(Style.self({ borderRadius: radius }))',
        replace: 'variant(Style.self({}))',
      },
    ],
    tests: browser,
  },
  {
    name: 'a priority img takes any earlier source as its own',
    edits: [
      {
        file: '../src/image.ts',
        find: "const within = picture !== -1 && html.indexOf('</picture>', picture) > at",
        replace: 'const within = picture !== -1',
      },
    ],
    tests: unit,
  },
  {
    name: 'a preload is escaped twice',
    edits: [{ file: '../src/image.ts', find: ".replace(/&amp;/g, '&'),", replace: '' }],
    tests: ['packages/mixins-ui/test/image.ssr.test.ts'],
  },
  {
    name: 'a preload drops its source’s type',
    edits: [
      {
        file: '../src/image.ts',
        find: "type: Option.flatMap(source, tag => attributeOf(tag, 'type')),",
        replace: 'type: Option.none(),',
      },
    ],
    tests: ['packages/mixins-ui/test/image.ssr.test.ts'],
  },
  {
    name: 'an unavailable image collapses',
    edits: [
      {
        file: '../src/recipes/image.ts',
        find: "        aspectRatio: 'var(--fk-image-ratio)',\n        inlineSize: 'var(--fk-image-width)',\n",
        replace: '',
      },
    ],
    tests: browser,
  },
  {
    name: 'an unavailable full-width image is as wide as its original',
    edits: [
      {
        file: '../src/recipes/image.ts',
        find: `Style.nest('&[data-unavailable][data-layout="full"]', { inlineSize: '100%' }),`,
        replace: '',
      },
    ],
    tests: browser,
  },
  {
    name: 'an unavailable image says nothing',
    edits: [
      {
        file: '../src/image.ts',
        find: "h.Role('img'),\n              h.AriaLabel(text),",
        replace: '',
      },
    ],
    tests: unit,
  },
  {
    name: 'a crop ignores the focal point',
    edits: [
      {
        file: '../src/recipes/image.ts',
        find: "objectPosition: 'var(--fk-image-focus, 50% 50%)',",
        replace: '',
      },
    ],
    tests: browser,
  },
  {
    name: 'an image complete at mount is marked loading first',
    edits: [
      {
        file: '../src/image.ts',
        find: 'if (element instanceof HTMLImageElement && element.complete) settle()\n          else mark(',
        replace: 'mark(',
      },
    ],
    tests: browser,
  },
  {
    name: 'a failed file is never marked',
    edits: [
      { file: '../src/image.ts', find: "element.addEventListener('error', failed)", replace: '' },
    ],
    tests: browser,
  },
  {
    name: 'a complete image with no pixels is marked loaded',
    edits: [
      {
        file: '../src/image.ts',
        find: "element.naturalWidth > 0 ? 'loaded' : 'failed'",
        replace: "true ? 'loaded' : 'failed'",
      },
    ],
    tests: browser,
    survives:
      'only an image that failed before its Mount ran (a server-rendered 404 before hydration) reaches it, and a browser test cannot make one fail first',
  },
  {
    name: 'a failed image still shows',
    edits: [
      {
        file: '../src/recipes/image.ts',
        find: `Style.nest('&[data-state="failed"]', { visibility: 'hidden' }),`,
        replace: '',
      },
    ],
    tests: browser,
  },
  {
    name: 'a source leaves out the img’s sizes',
    edits: [
      {
        file: '../src/image.ts',
        find: 'h.Srcset(source.srcset),\n              h.Sizes(img.sizes),',
        replace: 'h.Srcset(source.srcset),',
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
  {
    name: 'an alt in plain words reads as ornament',
    edits: [
      {
        file: '../src/image.ts',
        find: "typeof options.alt === 'string' ? described(options.alt) : options.alt",
        replace: "typeof options.alt === 'string' ? decorative : options.alt",
      },
    ],
    tests: ['packages/mixins-ui/test/image.test.ts'],
  },
]
