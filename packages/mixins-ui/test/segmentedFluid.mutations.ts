/**
 * The segmented pill and hover, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/segmentedFluid.mutations.ts`.
 */
const tests = ['packages/mixins-ui/test/segmented.browser.test.ts']
const recipe = '../src/recipes/segmented.ts'
const adapter = '../src/segmented.ts'

export default [
  {
    name: 'the pressed option keeps its fill under the pill',
    edits: [
      {
        file: recipe,
        find: 'Style.nest(`&:not([data-fluid-hover]) > ${pressed}`',
        replace: 'Style.nest(`& > ${pressed}`',
      },
    ],
    tests,
  },
  {
    name: 'the pressed option is not measured',
    edits: [
      {
        file: adapter,
        find: "Measure({ targets: { 'segmented-chosen': pressed } })",
        replace: "Measure({ targets: { 'segmented-chosen': '[data-never]' } })",
      },
    ],
    tests,
  },
  {
    name: 'the hover follows nothing',
    edits: [{ file: adapter, find: "item: '[aria-pressed]',", replace: "item: '[data-never]'," }],
    tests,
  },
  {
    name: 'the pill shows before fluid runs',
    edits: [
      {
        file: recipe,
        find: "    display: 'none',\n    inlineSize: at(name, 'w'),",
        replace: "    inlineSize: at(name, 'w'),",
      },
    ],
    tests,
  },
]
