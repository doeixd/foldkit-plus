/**
 * The icon, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/icon.mutations.ts` checks that a
 * test fails for every one.
 */
const tests = ['packages/mixins-ui/test/icon.test.ts']
const ssr = ['packages/mixins-ui/test/icon.ssr.test.ts']
const browser = ['packages/mixins-ui/test/icon.browser.test.ts']

export default [
  {
    name: 'a decorative icon is announced',
    edits: [
      {
        file: '../src/icon.ts',
        find: 'builders.glyph.attrs([h.AriaHidden(true)])',
        replace: 'builders.glyph.attrs([])',
      },
    ],
    tests,
  },
  {
    name: 'a drawing is announced',
    edits: [{ file: '../src/icon.ts', find: '      h.AriaHidden(true),', replace: '' }],
    tests: ssr,
  },
  {
    name: 'a drawing keeps its own ids',
    edits: [{ file: '../src/icon.ts', find: 'MediaIcon.prefixIds(icon, prefix)', replace: 'icon' }],
    tests: ssr,
  },
  {
    name: 'a key parts no copies',
    edits: [
      {
        file: '../src/icon.ts',
        find: "(options.key === undefined ? '' : `-${options.key}`)",
        replace: "''",
      },
    ],
    tests: ssr,
  },
  {
    name: 'a drawing alone has no size',
    edits: [
      { file: '../src/icon.ts', find: "h.Attribute('width', '1em'),", replace: '' },
      { file: '../src/icon.ts', find: "h.Attribute('height', '1em'),", replace: '' },
    ],
    tests: browser,
  },
  {
    name: 'a drawing in a glyph keeps its own size',
    edits: [
      {
        file: '../src/recipes/icon.ts',
        find: "Style.nest('& > svg', { inlineSize: '100%', blockSize: '100%' }),",
        replace: '',
      },
    ],
    tests: browser,
  },
]
