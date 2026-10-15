/**
 * The Sheet and Drawer recipes, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/sheet.mutations.ts` checks that a
 * test fails for every one.
 */
const unit = 'packages/mixins-ui/test/sheet.test.ts'
const browser = 'packages/mixins-ui/test/sheet.browser.test.ts'

export default [
  {
    name: 'a right sheet sits in the middle',
    edits: [
      {
        file: '../src/recipes/sheet.ts',
        find: "right: 'stretch right',",
        replace: "right: 'stretch center',",
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'a closed bottom sheet waits above the page',
    edits: [
      { file: '../src/recipes/sheet.ts', find: "bottom: '0 100%'", replace: "bottom: '0 -100%'" },
    ],
    tests: [unit],
  },
  {
    name: 'every edge is bordered',
    edits: [
      {
        file: '../src/recipes/sheet.ts',
        find: 'each === facing ? ref.border.thin : ',
        replace: 'true ? ref.border.thin : ',
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'every corner takes the radius',
    edits: [
      {
        file: '../src/recipes/sheet.ts',
        find: 'corner.includes(facing) ? radius : ',
        replace: 'true ? radius : ',
      },
    ],
    tests: [unit, browser],
  },
  {
    name: "the Dialog's centering margin stays",
    edits: [{ file: '../src/recipes/sheet.ts', find: "      margin: '0',\n", replace: '' }],
    tests: [browser],
  },
  {
    name: 'the padding adds to the width',
    edits: [
      { file: '../src/recipes/sheet.ts', find: "      boxSizing: 'border-box',\n", replace: '' },
    ],
    tests: [browser],
  },
  {
    name: 'a side sheet spans the page',
    edits: [
      {
        file: '../src/recipes/sheet.ts',
        find: "{ inlineSize: 'min(24rem, 75%)' }",
        replace: "{ inlineSize: '100%' }",
      },
    ],
    tests: [browser],
  },
  {
    name: 'the Drawer squares its inner corners',
    edits: [
      {
        file: '../src/recipes/sheet.ts',
        find: "component(Style.self({ '--_fk-sheet-radius': ref.radius.lg }))",
        replace: 'component(Style.self({}))',
      },
    ],
    tests: [unit, browser],
  },
  {
    name: "a bottom Drawer's handle is on its bottom edge",
    edits: [
      {
        file: '../src/recipes/sheet.ts',
        find: "bottom: { panel: variant(handle('::before')) },",
        replace: "bottom: { panel: variant(handle('::after')) },",
      },
    ],
    tests: [unit, browser],
  },
]
