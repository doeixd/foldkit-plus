/**
 * Segmented controls with icons, sizes, a full width and an underline,
 * broken in turn: `pnpm mutate packages/mixins-ui/test/segmentedKinds.mutations.ts`.
 */
const tests = ['packages/mixins-ui/test/segmentedKinds.browser.test.ts']
const view = '../src/segmented.ts'
const recipe = '../src/recipes/segmented.ts'

export default [
  {
    name: 'the steady copy leaves out the icon',
    edits: [
      {
        file: recipe,
        find: "paddingInlineStart: `calc(${ladder('icon')} + ${ladder('gap')})`,",
        replace: "paddingInlineStart: '0px',",
      },
    ],
    tests,
  },
  {
    name: 'an icon alone is as wide as its padding makes it',
    edits: [
      {
        file: recipe,
        find: "Style.pseudo('[data-icon=\"only\"]', { inlineSize: optionHeight, paddingInline: '0' }),",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'an icon alone draws its words too',
    edits: [{ file: view, find: '            [mark],\n', replace: '            [mark, words],\n' }],
    tests,
  },
  {
    name: 'the underline is the pressed option’s pill',
    edits: [
      {
        file: recipe,
        find: '            blockSize: ref.border.thick,\n            translate:',
        replace: '            translate:',
      },
    ],
    tests,
  },
  {
    name: 'a full width is the options’ own',
    edits: [{ file: recipe, find: "gridAutoColumns: '1fr',", replace: '' }],
    tests,
  },
  {
    name: 'a tray runs the container’s width',
    edits: [{ file: recipe, find: "            inlineSize: 'fit-content',\n", replace: '' }],
    tests,
  },
  {
    name: 'lg is md',
    edits: [
      {
        file: recipe,
        find: '      lg: { group: steps.lg, option: steps.lg },',
        replace: '      lg: { group: steps.md, option: steps.md },',
      },
    ],
    tests,
  },
]
