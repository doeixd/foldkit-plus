/**
 * The tree example, broken in turn:
 * `pnpm mutate examples/tree/test/tree.mutations.ts` checks that a test
 * fails for every one.
 */
const tests = ['examples/tree/test/tree.test.ts']

export default [
  {
    name: 'committing focus clears the selection',
    edits: [
      {
        file: '../src/app.ts',
        find: 'SelPlaced.helpers.activate(current)(model)',
        replace: 'SelPlaced.helpers.clear()(model)',
      },
    ],
    tests,
  },
  {
    name: 'an expander toggles nothing',
    edits: [
      {
        file: '../src/app.ts',
        find: 'ToggledRow: ({ id }) => NavPlaced.helpers.toggle(id)(model),',
        replace: 'ToggledRow: () => ({ model }),',
      },
    ],
    tests,
  },
  {
    name: 'the tree starts open',
    edits: [
      {
        file: '../src/app.ts',
        find: 'export const navArgs = { openByDefault: false } as const',
        replace: 'export const navArgs = { openByDefault: true } as const',
      },
    ],
    tests,
  },
  {
    name: 'every row takes a click',
    edits: [
      {
        file: '../src/app.ts',
        find: "{ id: 'dialog', parent: 'components', label: 'Dialog.ts', branch: false, disabled: true },",
        replace: "{ id: 'dialog', parent: 'components', label: 'Dialog.ts', branch: false },",
      },
    ],
    tests,
  },
]
