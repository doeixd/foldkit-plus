/**
 * The navigation menu, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/nav.mutations.ts` checks that a test
 * fails for every one.
 */
const file = '../src/nav.ts'
const recipe = '../src/recipes/nav.ts'
const unit = 'packages/mixins-ui/test/nav.test.ts'
const browser = 'packages/mixins-ui/test/nav.browser.test.ts'

export default [
  {
    name: 'a reader counts the indicator',
    edits: [
      {
        file,
        find: "indicator: builders.indicator.attrs([\n      context.h.AriaHidden(true),\n      context.h.Role('presentation'),\n    ]),",
        replace: 'indicator: builders.indicator.attrs([]),',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a reader counts the highlight',
    edits: [
      {
        file,
        find: "highlight: builders.highlight.attrs([\n      context.h.AriaHidden(true),\n      context.h.Role('presentation'),\n    ]),",
        replace: 'highlight: builders.highlight.attrs([]),',
      },
    ],
    tests: [unit],
  },
  {
    name: 'the indicator measures the first link',
    edits: [
      {
        file,
        find: "targets: { 'nav-chosen': current }",
        replace: "targets: { 'nav-chosen': 'a' }",
      },
    ],
    tests: [browser],
  },
  {
    name: 'the highlight writes under another name',
    edits: [
      {
        file,
        find: "FluidHover({ name: 'nav-hover',",
        replace: "FluidHover({ name: 'tabs-hover',",
      },
    ],
    tests: [browser],
  },
  {
    name: 'without fluid the current link draws no line',
    edits: [
      {
        file: recipe,
        find: 'boxShadow: `inset 0 calc(-1 * ${ref.border.thick}) 0 ${ref.accent.default}`,',
        replace: '',
      },
    ],
    tests: [browser],
  },
  {
    name: 'with fluid the indicator never shows',
    edits: [
      {
        file: recipe,
        find: "Style.nest(fluid, { display: 'var(--fk-nav-chosen-display, none)' }),",
        replace: "Style.nest(fluid, { display: 'none' }),",
      },
    ],
    tests: [browser],
  },
]
