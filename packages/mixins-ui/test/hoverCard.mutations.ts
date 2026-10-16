/**
 * The hover card's panel, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/hoverCard.mutations.ts` checks that a
 * test fails for every one.
 */
const browser = ['packages/mixins-ui/test/hoverCard.browser.test.ts']

export default [
  {
    name: 'the open card stands in the flow beside its trigger',
    edits: [
      {
        file: '../src/recipes/hoverCard.ts',
        find: "        position: 'absolute',",
        replace: "        position: 'static',",
      },
    ],
    tests: browser,
  },
]
