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
  {
    name: 'the overlays anchor at the inline start, off their item right to left',
    edits: [{ file: recipe, find: "left: '0',", replace: "insetInlineStart: '0'," }],
    tests,
  },
  {
    name: 'a direction flipped after mount leaves the indicator where it was',
    // A Mount that does nothing here in its place, imported so the mutant still loads.
    edits: [
      {
        file: '../src/segmented.ts',
        find: "import { FluidHover, Measure } from 'foldkit-primitives/dom'",
        replace: "import { FluidHover, FollowTabStop, Measure } from 'foldkit-primitives/dom'",
      },
      {
        file: '../src/segmented.ts',
        find: 'mount: () => FollowDirection(),',
        replace: 'mount: () => FollowTabStop(),',
      },
    ],
    tests,
  },
]
