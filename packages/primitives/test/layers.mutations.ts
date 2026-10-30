/**
 * HideOutside's release, broken in turn:
 * `pnpm mutate packages/primitives/test/layers.mutations.ts` checks that a
 * test fails for every one.
 */
const tests = ['packages/primitives/test/layers.test.ts']

export default [
  {
    // An interruptible acquire stopped while it waits for the frame never
    // registers its release, so the element keeps its mark.
    name: 'hide-outside acquire is interruptible',
    edits: [
      {
        file: '../src/dom/layers.ts',
        find: '            Effect.sync(() => element.removeAttribute(HIDE_OUTSIDE_ATTRIBUTE)),\n          ),\n      ),',
        replace:
          '            Effect.sync(() => element.removeAttribute(HIDE_OUTSIDE_ATTRIBUTE)),\n          ),\n        { interruptible: true },\n      ),',
      },
    ],
    tests,
  },
  {
    name: 'hide-outside releases nothing',
    edits: [
      {
        file: '../src/dom/layers.ts',
        find: '          Effect.andThen(Dom.restoreInert(id), () =>',
        replace: '          Effect.andThen(Effect.void, () =>',
      },
    ],
    tests,
  },
]
