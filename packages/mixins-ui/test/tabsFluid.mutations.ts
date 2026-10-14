/**
 * The tabs' indicator and hover, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/tabsFluid.mutations.ts`.
 */
const tests = ['packages/mixins-ui/test/tabs.browser.test.ts']
const adapter = '../src/tabs.ts'
const recipe = '../src/recipes/tabs.ts'

export default [
  {
    name: 'a chosen tab marks itself beside the indicator',
    edits: [
      {
        file: recipe,
        find: 'const marked = `:where(:not([data-fluid-hover])) > &${selected}`',
        replace: 'const marked = `&${selected}`',
      },
    ],
    tests,
  },
  {
    name: 'the indicator never shows',
    edits: [
      {
        file: recipe,
        find: "const fluid = ':where([data-fluid-hover]) > &'",
        replace: "const fluid = ':where([data-never]) > &'",
      },
    ],
    tests,
  },
  {
    name: 'the chosen tab is not measured',
    edits: [
      {
        file: adapter,
        find: "mount: () => Measure({ targets: { 'tabs-chosen': chosen } }),",
        replace: "mount: () => Measure({ targets: { 'tabs-chosen': '[data-never]' } }),",
      },
    ],
    tests,
  },
  {
    name: 'the hover follows nothing',
    edits: [{ file: adapter, find: 'item: \'[role="tab"]\',', replace: "item: '[data-never]'," }],
    tests,
  },
  {
    name: 'the rule under the chosen tab is a stub',
    edits: [
      {
        file: recipe,
        find: "            inlineSize: chosen('w'),\n            blockSize: ref.border.thick,",
        replace: "            inlineSize: '4px',\n            blockSize: ref.border.thick,",
      },
    ],
    tests,
  },
]
