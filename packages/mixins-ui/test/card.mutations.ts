/**
 * The card, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/card.mutations.ts` checks that a test
 * fails for every one.
 */
const tests = ['packages/mixins-ui/test/card.test.ts']

export default [
  {
    name: 'the card loses its surface',
    edits: [
      {
        file: '../src/recipes/card.ts',
        find: 'background: ref.surface.base,',
        replace: 'background: ref.surface.muted,',
      },
    ],
    tests,
  },
  {
    name: 'cards default to flush padding',
    edits: [
      {
        file: '../src/recipes/card.ts',
        find: "defaults: { padding: 'comfortable' },",
        replace: "defaults: { padding: 'flush' },",
      },
    ],
    tests,
  },
]
