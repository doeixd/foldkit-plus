/**
 * A Menubar's header, footer, anchor, `configure` and Bundle, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/menubarFamily.mutations.ts`.
 */
const browser = 'packages/mixins-ui/test/menubarFamily.browser.test.ts'

export default [
  {
    name: 'a menu’s header is not drawn',
    edits: [
      {
        file: '../src/menubar.ts',
        find: 'shown.header === undefined',
        replace: 'true',
      },
    ],
    tests: [browser],
  },
  {
    name: 'the bar’s anchor is ignored',
    edits: [{ file: '../src/menubar.ts', find: '...options.anchor,', replace: '' }],
    tests: [browser],
  },
  {
    name: 'a Menubar preset is ignored',
    edits: [
      {
        file: '../src/menubar.ts',
        find: 'view(layered(config, options), h)',
        replace: 'view(options, h)',
      },
    ],
    tests: [browser],
  },
  {
    name: 'Bundles.Menubar starts with no menus',
    edits: [
      {
        file: '../src/bundles/menubar.ts',
        find: 'init(ids, options)',
        replace: 'init([], options)',
      },
    ],
    tests: [browser],
  },
]
