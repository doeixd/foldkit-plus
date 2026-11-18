/**
 * A Menu's header, footer, row content, anchor and `configure`, broken in
 * turn: `pnpm mutate packages/mixins-ui/test/menuFamily.mutations.ts`.
 */
const browser = 'packages/mixins-ui/test/menuFamily.browser.test.ts'

export default [
  {
    name: 'the header is not drawn',
    edits: [
      {
        file: '../src/popupView.ts',
        find: '...(panel.header === undefined ? [] : [panel.header]),',
        replace: '',
      },
    ],
    tests: [browser],
  },
  {
    name: 'the footer is not drawn',
    edits: [
      {
        file: '../src/popupView.ts',
        find: '...(panel.footer === undefined ? [] : [panel.footer]),',
        replace: '',
      },
    ],
    tests: [browser],
  },
  {
    name: 'a row’s content is not drawn in place of its words',
    edits: [
      {
        file: '../src/menu.ts',
        find: 'h.span(builders.label.attrs(), [row.content ?? row.label]),',
        replace: 'h.span(builders.label.attrs(), [row.label]),',
      },
    ],
    tests: [browser],
  },
  {
    name: 'the anchor option is ignored',
    edits: [{ file: '../src/menu.ts', find: '...options.anchor,', replace: '' }],
    tests: [browser],
  },
  {
    name: 'a Menu preset is ignored',
    edits: [
      {
        file: '../src/menu.ts',
        find: 'const merged = layered(config, options)',
        replace: 'const merged = options',
      },
    ],
    tests: [browser],
  },
  {
    name: 'Bundles.Menu starts with no submenu for the rows that open one',
    edits: [
      {
        file: '../src/bundles/menu.ts',
        find: 'init(id, rows, options)',
        replace: 'init(id, [], options)',
      },
    ],
    tests: ['packages/mixins-ui/test/menuBundle.test.ts'],
  },
]
