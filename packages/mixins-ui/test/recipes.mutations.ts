/**
 * The recipes' fixes, broken in turn: `pnpm mutate packages/mixins-ui/test/recipes.mutations.ts`
 * checks that a test fails for every one.
 */
const tests = ['packages/mixins-ui/test/recipes.test.ts']

export default [
  {
    name: 'the pressed option is a component rule, under an icon button’s background',
    edits: [
      {
        file: '../src/recipes/segmented.ts',
        find: '    group: variant(\n      // One pressed rule',
        replace: '    group: component(\n      // One pressed rule',
      },
    ],
    tests,
  },
  {
    name: 'an icon button keeps its gap',
    edits: [{ file: '../src/recipes/button.ts', find: "            gap: '0',\n", replace: '' }],
    tests,
  },
  {
    name: 'an unfilled hover is a solid ground',
    edits: [
      {
        file: '../src/recipes/design.ts',
        find: "export const unfilledHover = 'color-mix(in oklab, currentColor 12%, transparent)'",
        replace: 'export const unfilledHover = ref.surface.muted',
      },
    ],
    tests,
  },
]
