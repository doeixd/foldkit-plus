/**
 * `Presence.behavior` and its composition with `FocusRecovery`, broken in turn:
 * `pnpm mutate packages/primitives/test/presence-behavior.mutations.ts` checks
 * that a test fails for every one.
 */
const source = '../src/interaction/presence.ts'
const recovery = '../src/dom/focus-recovery.ts'
const browser = 'packages/primitives/test/presence-behavior.browser.test.ts'
const unit = 'packages/primitives/test/presence-behavior.test.ts'

export default [
  {
    name: 'aria-hidden stands in for inert',
    edits: [
      {
        file: source,
        find: 'h.Inert(phase !== ',
        replace: "h.AriaHidden(phase !== 'shown'), h.Inert(false && phase !== ",
      },
    ],
    tests: [browser, unit],
  },
  {
    name: 'inert is kept after a Show',
    edits: [{ file: source, find: "h.Inert(phase !== 'shown')", replace: 'h.Inert(true)' }],
    tests: [browser, unit],
  },
  {
    name: 'inert is left out of the markup of a hiding row',
    edits: [
      {
        file: source,
        find: "h.Inert(phase !== 'shown')",
        replace: "h.DataAttribute('inert-was', String(phase !== 'shown'))",
      },
    ],
    tests: [browser, unit],
  },
  {
    name: 'recovery waits for the removal instead of the inert frame',
    edits: [
      {
        file: recovery,
        find: "attributeFilter: ['inert', 'hidden', 'disabled']",
        replace: "attributeFilter: ['hidden', 'disabled']",
      },
    ],
    tests: [browser],
  },
]
