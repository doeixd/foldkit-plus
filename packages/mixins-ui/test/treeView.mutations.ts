/**
 * The tree view, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/treeView.mutations.ts` checks that a
 * test fails for every one.
 */
const unit = 'packages/mixins-ui/test/treeView.test.ts'
const browser = 'packages/mixins-ui/test/treeView.browser.test.ts'

export default [
  {
    name: 'a move sends no focus',
    edits: [
      {
        file: '../src/treeView.ts',
        find: 'commands: [FocusItem({ id: itemId(model, id) })],',
        replace: 'commands: [],',
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'every row is a tab stop',
    edits: [
      {
        file: '../src/treeView.ts',
        find: 'h.Tabindex(stop === node.id ? 0 : -1)',
        replace: 'h.Tabindex(0)',
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'a label is drawn outside its Slot',
    edits: [
      {
        file: '../src/treeView.ts',
        find: 'h.span(builders.label.attrs(), [node.label])',
        replace: 'h.span([], [node.label])',
      },
    ],
    tests: [unit],
  },
  {
    name: 'no row sits further in than its parent',
    edits: [
      {
        file: '../src/recipes/treeView.ts',
        find: '(var(--fk-tree-level, 1) - 1) * ${ref.space.md}',
        replace: '0 * ${ref.space.md}',
      },
    ],
    tests: [browser],
  },
  {
    name: 'a shut group keeps its height',
    edits: [
      {
        file: '../src/recipes/design.ts',
        find: "gridTemplateRows: 'auto 0fr',",
        replace: "gridTemplateRows: 'auto auto',",
      },
    ],
    tests: [browser],
  },
  {
    name: 'an opening group stretches its parent row',
    edits: [
      {
        file: '../src/recipes/design.ts',
        find: "      alignContent: 'start',\n",
        replace: '',
      },
    ],
    tests: [browser],
  },
]
