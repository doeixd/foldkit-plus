/**
 * The edge-avoidance rule, broken in turn:
 * `pnpm mutate examples/widgets/test/place.mutations.ts` checks that a test
 * fails for every one.
 */
const tests = ['examples/widgets/test/place.test.ts', 'examples/widgets/test/hover-card.test.ts']

export default [
  {
    name: 'overflow shifts right, off the window',
    edits: [
      {
        file: '../src/place.ts',
        find: 'dx: over > 0 ? -over : 0,',
        replace: 'dx: over > 0 ? over : 0,',
      },
    ],
    tests,
  },
  {
    name: 'the card stops watching its edge',
    edits: [
      {
        file: '../src/hover-card/view.ts',
        find: "Behavior.attach(keepInView(HoverCardSlots)({ panel: 'card' })),",
        replace: '',
      },
    ],
    tests,
  },
]
