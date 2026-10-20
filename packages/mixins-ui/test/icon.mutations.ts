/**
 * The icon, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/icon.mutations.ts` checks that a
 * test fails for every one.
 */
const tests = ['packages/mixins-ui/test/icon.test.ts']
const ssr = ['packages/mixins-ui/test/icon.ssr.test.ts']
const browser = ['packages/mixins-ui/test/icon.browser.test.ts']
// `Icon.draw` lives in foldkit-media; these tests are where its drawing is rendered.
const drawing = '../../media/src/icon.ts'

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
    edits: [{ file: drawing, find: '      h.AriaHidden(true),', replace: '' }],
    tests: ssr,
  },
  {
    name: 'a drawing keeps its own ids',
    edits: [{ file: drawing, find: 'prefixIds(icon, prefix)', replace: 'icon' }],
    tests: ssr,
  },
  {
    name: 'a key parts no copies',
    edits: [
      {
        file: drawing,
        find: "(options.key === undefined ? '' : `-${options.key}`)",
        replace: "''",
      },
    ],
    tests: ssr,
  },
  {
    name: 'a drawing alone has no size',
    edits: [
      {
        file: drawing,
        find: "const size = options.size ?? '1em'",
        replace: "const size = options.size ?? ''",
      },
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
