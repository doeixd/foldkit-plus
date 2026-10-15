/**
 * A table's fluid hover, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/tableFluid.mutations.ts`.
 */
const tests = ['packages/mixins-ui/test/tableFluid.browser.test.ts']
const recipe = '../src/recipes/table.ts'

export default [
  {
    name: 'the lit row keeps its lines',
    edits: [
      {
        file: recipe,
        find: 'Style.nest(`&${lit}, &:has(+ ${lit})`, {',
        replace: 'Style.nest(`&[data-never]`, {',
      },
    ],
    tests,
  },
  {
    name: 'the row above the lit one keeps its line',
    edits: [
      {
        file: recipe,
        find: 'Style.nest(`&${lit}, &:has(+ ${lit})`, {',
        replace: 'Style.nest(`&${lit}`, {',
      },
    ],
    tests,
  },
  {
    name: 'the header keeps its line over a lit first row',
    edits: [
      {
        file: recipe,
        find: 'tbody > tr:first-child${lit}',
        replace: 'tbody > tr:first-child[data-never]',
      },
    ],
    tests,
  },
  {
    name: 'a fluid table draws no highlight',
    edits: [
      {
        file: '../src/table.ts',
        find: '[h.div(builders.highlight.attrs([h.AriaHidden(true)]), []), table],',
        replace: '[table],',
      },
    ],
    tests,
  },
]
