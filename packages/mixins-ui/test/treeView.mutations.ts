/**
 * The tree view, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/treeView.mutations.ts` checks that a
 * test fails for every one.
 */
const unit = 'packages/mixins-ui/test/treeView.test.ts'
const browser = 'packages/mixins-ui/test/treeView.browser.test.ts'

export default [
  {
    name: 'typing forgets the letters before it',
    edits: [{ file: '../src/treeView.ts', find: 'model.typeahead.query + key', replace: 'key' }],
    tests: [unit],
  },
  {
    name: 'a stale expiry drops the query',
    edits: [
      {
        file: '../src/treeView.ts',
        find: 'generation === model.typeahead.generation &&',
        replace: 'true &&',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a move leaves the typed word',
    edits: [
      {
        file: '../src/treeView.ts',
        find: 'Focus: ({ id }) => focused(calm, id),',
        replace: 'Focus: ({ id }) => focused(model, id),',
      },
    ],
    tests: [unit],
  },
  {
    name: 'star opens a row that holds none',
    edits: [{ file: '../src/treeView.ts', find: 'other.branch &&', replace: '' }],
    tests: [unit],
  },
  {
    name: 'star opens a disabled row',
    edits: [{ file: '../src/treeView.ts', find: 'other.disabled !== true &&', replace: '' }],
    tests: [unit],
  },
  {
    name: 'star opens rows of other parents',
    edits: [{ file: '../src/treeView.ts', find: 'other.parent === row.parent &&', replace: '' }],
    tests: [unit],
  },
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
    name: 'an opening group slides its rows in from the side',
    edits: [
      {
        file: '../src/recipes/design.ts',
        find: "      gridTemplateRows: 'auto 0fr',\n      alignContent: 'start',\n      transitionProperty: 'grid-template-rows',",
        replace:
          "      gridTemplateRows: 'auto 0fr',\n      alignContent: 'start',\n      paddingInlineStart: '1rem',\n      transitionProperty: 'grid-template-rows, padding-inline-start',",
      },
      {
        file: '../src/recipes/design.ts',
        find: "      gridTemplateRows: 'auto 1fr',",
        replace: "      gridTemplateRows: 'auto 1fr',\n      paddingInlineStart: '0',",
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
  {
    name: 'a trunk lists every fully checked row',
    edits: [
      {
        file: '../src/treeView.ts',
        find: "as === 'branch' || row.parent === null || !full.has(row.parent)",
        replace: 'true',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a branch value lists only the outermost rows',
    edits: [{ file: '../src/treeView.ts', find: "as === 'branch' ||", replace: 'false ||' }],
    tests: [unit],
  },
  {
    name: 'a partly checked row is listed as fully checked',
    edits: [
      {
        file: '../src/treeView.ts',
        find: 'if (state === true) full.add(id)',
        replace: 'if (state !== false) full.add(id)',
      },
    ],
    tests: [unit],
  },
  {
    name: 'the leaf value lists rows holding rows',
    edits: [
      {
        file: '../src/treeView.ts',
        find: '(!row.branch && on.has(row.id) ? [row.id] : []))\n  const full',
        replace: '(on.has(row.id) ? [row.id] : []))\n  const full',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a branch id expands to nothing',
    edits: [
      {
        file: '../src/treeView.ts',
        find: 'value.flatMap(id => flat.leaves.get(id) ?? [])',
        replace: 'value.flatMap(id => (flat.leaves.get(id) ?? []).slice(0, 1))',
      },
    ],
    tests: [unit],
  },
]
