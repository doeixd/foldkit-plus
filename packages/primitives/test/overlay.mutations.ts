/**
 * The overlay policy, broken in turn:
 * `pnpm mutate packages/primitives/test/overlay.mutations.ts` checks that a
 * test fails for every one.
 */
const tests = ['packages/primitives/test/overlay.test.ts']

export default [
  {
    name: 'modal leaves the page scrollable',
    edits: [
      {
        file: '../src/interaction/overlay.ts',
        find: 'focus: { contain: true, restore: true },\n  scroll: { lock: true },',
        replace: 'focus: { contain: true, restore: true },\n  scroll: { lock: false },',
      },
    ],
    tests,
  },
  {
    name: 'modeless traps and locks',
    edits: [
      {
        file: '../src/interaction/overlay.ts',
        find: 'focus: { contain: false, restore: true },\n  scroll: { lock: false },\n  inert: false,',
        replace:
          'focus: { contain: true, restore: true },\n  scroll: { lock: true },\n  inert: true,',
      },
    ],
    tests,
  },
  {
    name: 'dismissal always escapes',
    edits: [
      {
        file: '../src/interaction/overlay.ts',
        find: 'escape: options.policy.dismiss.escape,',
        replace: 'escape: true,',
      },
    ],
    tests,
  },
]
