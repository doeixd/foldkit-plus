/**
 * HideOutside's release, broken in turn:
 * `pnpm mutate packages/primitives/test/layers.mutations.ts` checks that a
 * test fails for every one.
 */
const file = '../src/dom/layers.ts'
const tests = ['packages/primitives/test/layers.test.ts']

export default [
  {
    name: 'hide-outside releases nothing',
    edits: [
      {
        file,
        find:
          '            Effect.andThen(\n' +
          '              Dom.restoreInert(id),\n' +
          '              Effect.sync(() => element.removeAttribute(HIDE_OUTSIDE_ATTRIBUTE)),\n' +
          '            ),',
        replace:
          '            Effect.andThen(\n' +
          '              Effect.void,\n' +
          '              Effect.sync(() => element.removeAttribute(HIDE_OUTSIDE_ATTRIBUTE)),\n' +
          '            ),',
      },
    ],
    tests,
  },
  {
    name: 'hide-outside leaves its mark after unmount',
    edits: [
      {
        file,
        find: 'Effect.sync(() => element.removeAttribute(HIDE_OUTSIDE_ATTRIBUTE)),',
        replace: 'Effect.void,',
      },
    ],
    tests,
  },
  {
    name: 'leaving leaves the rest of the page inert',
    edits: [
      {
        file,
        find: 'if (element.hasAttribute(LEAVING)) Effect.runSync(Dom.restoreInert(id))\n          else Queue.offerUnsafe(answers, false)',
        replace: 'Queue.offerUnsafe(answers, false)',
      },
    ],
    tests,
  },
  {
    name: 'showing again never hides the outside',
    edits: [
      {
        file,
        find: 'element.hasAttribute(LEAVING) ? Effect.void : conceal()',
        replace: 'Effect.void',
      },
    ],
    tests,
  },
]
