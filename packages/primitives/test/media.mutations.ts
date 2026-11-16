/**
 * `MediaQuery`'s first value, broken in turn: `pnpm mutate
 * packages/primitives/test/media.mutations.ts` checks that a test fails for every one.
 */
const file = '../src/media/mediaquery.ts'
const unit = 'packages/primitives/test/media.test.ts'
const browser = 'packages/primitives/test/media.browser.test.ts'

export default [
  {
    name: 'the Model starts unmatched whatever the window answers',
    edits: [{ file, find: 'initial ?? matchesNow(query)', replace: 'initial ?? false' }],
    tests: [unit, browser],
  },
  {
    name: 'a given `initial` is ignored',
    edits: [{ file, find: 'initial ?? matchesNow(query)', replace: 'matchesNow(query)' }],
    tests: [unit, browser],
  },
  {
    name: 'a window without matchMedia is asked anyway',
    edits: [
      { file, find: "  typeof window.matchMedia === 'function' &&\n  window", replace: '  window' },
    ],
    tests: [unit],
  },
]
