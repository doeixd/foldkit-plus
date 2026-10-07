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
        find: 'Selection.Message.Activated({ id: current })',
        replace: 'Selection.Message.Cleared()',
      },
    ],
    tests,
  },
  {
    name: 'expanders open what is open',
    edits: [
      {
        file: '../src/view.ts',
        find: 'TreeNavigation.isOpen(model.nav, navArgs, id)\n      ? TreeNavigation.Message.Closed({ id })',
        replace:
          'TreeNavigation.isOpen(model.nav, navArgs, id)\n      ? TreeNavigation.Message.Opened({ id })',
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
