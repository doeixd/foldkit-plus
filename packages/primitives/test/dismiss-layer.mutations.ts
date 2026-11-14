/**
 * Escape in a layer, broken in turn:
 * `pnpm mutate packages/primitives/test/dismiss-layer.mutations.ts` checks
 * that a test fails for every one.
 */
const source = '../src/interaction/dismiss-layer.ts'
const unit = 'packages/primitives/test/dismiss-layer.test.ts'
const browser = 'packages/primitives/test/dismiss-layer.browser.test.ts'

export default [
  {
    name: 'the layer dismisses an Escape a handler below it already took',
    edits: [
      {
        file: source,
        find: 'if (event.defaultPrevented || (event as KeyboardEvent).key',
        replace: 'if ((event as KeyboardEvent).key',
      },
    ],
    tests: [browser],
  },
  {
    // Before the input's own handler runs, `defaultPrevented` is never set yet.
    name: 'the layer listens in the capture phase again',
    edits: [
      {
        file: source,
        find: "document.addEventListener('keydown', onKeyDown)",
        replace: "document.addEventListener('keydown', onKeyDown, { capture: true })",
      },
      {
        file: source,
        find: "document.removeEventListener('keydown', onKeyDown)",
        replace: "document.removeEventListener('keydown', onKeyDown, { capture: true })",
      },
    ],
    tests: [browser],
  },
  {
    name: 'Escape no longer dismisses at all',
    edits: [
      {
        file: source,
        find: "|| (event as KeyboardEvent).key !== 'Escape') return",
        replace: "|| (event as KeyboardEvent).key === 'Escape') return",
      },
    ],
    tests: [unit, browser],
  },
]
