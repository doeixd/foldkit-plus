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
    name: 'the tree reads the arrows physically right to left',
    edits: [
      {
        file: '../src/treeView.ts',
        find: 'const key = readingKey(pressed, options.direction)',
        replace: 'const key = pressed',
      },
    ],
    tests: [unit],
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
        find: '(var(--fk-tree-level, 1) - 1) * ${indent}',
        replace: '0 * ${indent}',
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
  {
    name: 'a row holding rows is never mixed',
    edits: [
      {
        file: '../src/treeView.ts',
        find: "count === under.length || 'mixed'",
        replace: 'count === under.length',
      },
    ],
    tests: [unit],
  },
  {
    name: 'checking a row checks its disabled rows too',
    edits: [
      {
        file: '../src/treeView.ts',
        find: '.filter(id => Option.isSome(enabled(id)))',
        replace: '',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a mixed row unchecks',
    edits: [
      {
        file: '../src/treeView.ts',
        find: 'const all = under.every(id => on.has(id))',
        replace: 'const all = under.some(id => on.has(id))',
      },
    ],
    tests: [unit],
  },
  {
    name: 'Space chooses in a checkable tree',
    edits: [
      {
        file: '../src/treeView.ts',
        find: "if (key === ' ' && options.checkable === true) {",
        replace: 'if (false) {',
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'a press on the box chooses the row too',
    edits: [
      {
        file: '../src/treeView.ts',
        find: "propagation: 'Stop',",
        replace: '',
      },
    ],
    tests: [browser],
  },
  {
    name: 'an open row keeps its shut icon',
    edits: [
      {
        file: '../src/treeView.ts',
        find: 'shown ? (node.openIcon ?? node.icon) : node.icon',
        replace: 'node.icon',
      },
    ],
    tests: [unit],
  },
  {
    name: 'the guide line runs at the row start, not under the chevron',
    edits: [
      {
        file: '../src/recipes/treeView.ts',
        find: 'calc(${rowStart} + ${chevronSize} / 2)',
        replace: 'calc(${rowStart})',
      },
    ],
    tests: [browser],
  },
]
