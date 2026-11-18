/**
 * The navigation menu's icons, panel footer, grid panel and `configure`,
 * broken in turn: `pnpm mutate packages/mixins-ui/test/navFamily.mutations.ts`.
 */
const browser = 'packages/mixins-ui/test/navFamily.browser.test.ts'

export default [
  {
    name: 'a panel link’s icon is not drawn',
    edits: [
      {
        file: '../src/nav.ts',
        find: ': [h.span(builders.icon.attrs([h.AriaHidden(true)]), [link.icon])]),',
        replace: ': []),',
      },
    ],
    tests: [browser],
  },
  {
    name: 'a top-level icon is not hidden from assistive technology',
    edits: [
      {
        file: '../src/nav.ts',
        find: ': [h.span(builders.icon.attrs([h.AriaHidden(true)]), [entry.icon])]),',
        replace: ': [h.span(builders.icon.attrs(), [entry.icon])]),',
      },
    ],
    tests: [browser],
  },
  {
    name: 'the panel footer is not drawn',
    edits: [{ file: '../src/nav.ts', find: 'entry.footer === undefined', replace: 'true' }],
    tests: [browser],
  },
  {
    name: 'the grid panel is unknown',
    edits: [{ file: '../src/recipes/nav.ts', find: '      grid: {', replace: '      gridx: {' }],
    tests: [browser],
  },
  {
    name: 'a Nav preset is ignored',
    edits: [
      {
        file: '../src/nav.ts',
        find: 'view(layered(config, options), h)',
        replace: 'view(options, h)',
      },
    ],
    tests: [browser],
  },
]
