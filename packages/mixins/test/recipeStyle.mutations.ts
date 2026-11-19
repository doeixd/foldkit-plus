/**
 * `recipe.style` is `Style.forSlots` of the selection, with the options:
 * `pnpm mutate packages/mixins/test/recipeStyle.mutations.ts`.
 */
const tests = ['packages/mixins/test/recipeStyle.test.ts']

export default [
  {
    name: 'style draws the selection it was given',
    edits: [
      {
        file: '../src/style.ts',
        find: 'forSlots(slots)(select(selection), options)',
        replace: 'forSlots(slots)(select(), options)',
      },
    ],
    tests,
  },
  {
    name: 'style passes its options on',
    edits: [
      {
        file: '../src/style.ts',
        find: 'forSlots(slots)(select(selection), options)',
        replace: 'forSlots(slots)(select(selection))',
      },
    ],
    tests,
  },
]
