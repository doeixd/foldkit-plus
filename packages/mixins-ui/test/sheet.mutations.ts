/**
 * The Sheet recipe and its handle, broken in turn:
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
    name: 'the bar squares the inner corners',
    edits: [
      {
        file: '../src/recipes/sheet.ts',
        find: "panel: variant(Style.self({ '--_fk-sheet-radius': ref.radius.lg })),",
        replace: 'panel: variant(Style.self({})),',
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'the handle shows without a bar',
    edits: [
      {
        file: '../src/recipes/sheet.ts',
        find: "display: 'none',",
        replace: "display: 'block',",
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'the bar leaves the handle hidden',
    edits: [
      {
        file: '../src/recipes/sheet.ts',
        find: "handle: variant(Style.self({ display: 'block' })),",
        replace: 'handle: variant(Style.self({})),',
      },
    ],
    tests: [unit, browser],
  },
  {
    name: "a bottom sheet's handle is its last row",
    edits: [
      {
        file: '../src/recipes/sheet.ts',
        find: "bottom: { order: '-1',",
        replace: "bottom: { order: '1',",
      },
    ],
    tests: [unit, browser],
  },
  {
    name: "a top sheet's handle keeps the view's order",
    edits: [
      {
        file: '../src/recipes/sheet.ts',
        find: "top: { order: '1',",
        replace: "top: { order: '0',",
      },
    ],
    tests: [unit, browser],
  },
  {
    name: "a right sheet's handle stands on its outer edge",
    edits: [
      {
        file: '../src/recipes/sheet.ts',
        find: '    left: ref.space.xs,',
        replace: '    right: ref.space.xs,',
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'the handle is announced',
    edits: [
      {
        file: '../src/dialog.ts',
        find: 'handle: [context.h.AriaHidden(true)]',
        replace: 'handle: []',
      },
    ],
    tests: [browser],
  },
]
