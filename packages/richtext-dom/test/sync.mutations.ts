/**
 * The editor owning the selection only while the focus is not on a control beside it, each part
 * broken in turn: `pnpm mutate packages/richtext-dom/test/sync.mutations.ts` checks that a test
 * fails for every one.
 */
const file = '../src/events.ts'

export default [
  {
    name: 'a content redraw restores the selection whoever has the focus',
    edits: [
      {
        file,
        find: 'activeElement !== body && !current.root.contains(activeElement)',
        replace: 'false',
      },
    ],
    tests: [
      'packages/richtext-dom/test/sync.browser.test.ts',
      'packages/richtext-dom/test/redecorate.browser.test.ts',
    ],
  },
  {
    name: 'a content redraw restores no selection',
    edits: [
      {
        file,
        find: 'if (!owned) return\n    restoreSelection(current, state.selection)\n',
        replace: 'if (!owned) return\n',
      },
    ],
    tests: ['packages/richtext-dom/test/sync.browser.test.ts'],
  },
] satisfies ReadonlyArray<{
  name: string
  edits: ReadonlyArray<{ file: string; find: string; replace: string }>
  tests: ReadonlyArray<string>
}>
