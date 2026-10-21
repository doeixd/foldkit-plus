/**
 * The tree view in a real browser, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/treeView.browser.mutations.ts` checks
 * that the test fails.
 */
const tests = ['packages/mixins-ui/test/treeView.browser.test.ts']

export default [
  {
    name: 'the tree reads the arrows physically right to left',
    edits: [
      {
        file: '../src/treeView.ts',
        find: 'const key = readingKey(pressed, options.direction)',
        replace: 'const key = pressed',
      },
    ],
    tests,
  },
  {
    name: 'the view swaps its keys but draws no direction',
    edits: [
      {
        file: '../src/treeView.ts',
        find: '...(options.direction === undefined ? [] : [h.Dir(options.direction)]),',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'the fluid highlight reaches the rows of a shut group',
    edits: [
      {
        file: '../src/treeView.ts',
        find: ':not([aria-disabled="true"], [inert] *) > :first-child',
        replace: ':not([aria-disabled="true"]) > :first-child',
      },
    ],
    tests,
  },
  {
    name: 'the fluid highlight ignores a row the keys focus',
    edits: [
      {
        file: '../src/treeView.ts',
        find: 'focused: \':scope:not([aria-disabled="true"]) > :first-child\',',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a row keeps its own hover under the fluid highlight',
    edits: [
      {
        file: '../src/recipes/treeView.ts',
        find: 'Style.nest(`${unlit}${HOVERED}`',
        replace: 'Style.nest(`&${HOVERED}`',
      },
    ],
    tests,
  },
  {
    name: 'the fluid highlight is never drawn',
    edits: [
      {
        file: '../src/recipes/treeView.ts',
        find: "Style.nest(':where([data-fluid-hover]) > &', { display: 'block' }),",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'FluidHover lights nothing from a focused element that is no item',
    edits: [
      {
        file: '../../primitives/src/dom/fluid-hover.ts',
        find: '(focused === undefined ? null : event.target.querySelector(focused))',
        replace: 'null',
      },
    ],
    tests,
  },
]
