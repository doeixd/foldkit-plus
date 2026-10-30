/**
 * The development overlay, broken in turn:
 * `pnpm mutate packages/mixins/test/devOverlay.mutations.ts`.
 */
const file = '../src/devOverlay.ts'
const tests = ['packages/mixins/test/devOverlay.browser.test.ts']

export default [
  {
    name: 'a diagnostic is not kept for the panel',
    edits: [
      {
        file,
        find: 'Effect.sync(() => show([...shown, diagnostic].slice(-kept)))',
        replace: 'Effect.void',
      },
    ],
    tests,
  },
  {
    name: 'a diagnostic is not passed on',
    edits: [{ file, find: '        next(diagnostic),\n', replace: '        Effect.void,\n' }],
    tests,
  },
  {
    name: 'Clear does nothing',
    edits: [{ file, find: 'panel(root, () => show([]))', replace: 'panel(root, () => {})' }],
    tests,
  },
  {
    name: 'an empty panel is still drawn',
    edits: [
      { file, find: 'section.hidden = shown.length === 0', replace: 'section.hidden = false' },
    ],
    tests,
  },
  {
    name: "the panel sits in the page's flow",
    edits: [{ file, find: 'position: fixed;', replace: 'position: static;' }],
    tests,
  },
  {
    name: 'the panel draws only what was reported before it mounted',
    edits: [{ file, find: 'listeners.add(listener)', replace: 'void listener' }],
    tests,
  },
  {
    name: 'one diagnostic is counted as many',
    edits: [
      { file, find: "shown.length === 1 ? 'diagnostic' : 'diagnostics'", replace: "'diagnostics'" },
    ],
    tests,
  },
]
