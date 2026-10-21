/**
 * Type roles and fields on touch, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/type.mutations.ts`.
 */
const design = '../src/recipes/design.ts'
const tokens = '../../mixins/src/theme/tokens.ts'

export default [
  {
    name: 'a field keeps its small text on a touch screen',
    edits: [{ file: '../src/recipes/field.ts', find: '  touchText,\n)', replace: ')' }],
    tests: ['packages/mixins-ui/test/type.touch.browser.test.ts'],
  },
  {
    name: 'the touch size is the role, not 16px',
    edits: [
      {
        file: design,
        find: "fontSize: `max(1rem, ${Theme.role('body').fontSize})`,",
        replace: "fontSize: Theme.role('body').fontSize,",
      },
    ],
    tests: ['packages/mixins-ui/test/type.touch.browser.test.ts'],
  },
  {
    name: 'a role keeps the leading the element had',
    edits: [
      {
        file: tokens,
        find: "  const leading = blend('type', `${name}-leading`)\n",
        replace: "  const leading = 'normal'\n",
      },
    ],
    tests: ['packages/mixins-ui/test/ladder.browser.test.ts'],
  },
  {
    name: 'controls keep one text size whatever the step',
    edits: [
      { file: design, find: "  ...Theme.role('body'),\n}", replace: "  fontSize: '14px',\n}" },
    ],
    tests: ['packages/mixins-ui/test/ladder.browser.test.ts'],
  },
  {
    name: 'a segmented label keeps its whole line',
    edits: [{ file: '../src/recipes/segmented.ts', find: '        ...trimmed,', replace: '' }],
    tests: ['packages/mixins-ui/test/ladder.browser.test.ts'],
  },
]
