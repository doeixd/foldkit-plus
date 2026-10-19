/**
 * The touch floor, each part broken in turn: `pnpm mutate
 * packages/mixins-ui/test/touchTarget.mutations.ts` checks that a test fails for every one.
 */
const tests = ['packages/mixins-ui/test/touchTarget.touch.browser.test.ts']

export default [
  {
    name: 'the reset sets no floor on a touch screen',
    edits: [
      {
        file: '../../mixins/src/defaults.ts',
        find: "    '@media (pointer:coarse){:where(:root){--fk-touch-floor:2.75rem}}',\n",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a control on the ladder ignores the floor',
    edits: [
      {
        file: '../src/recipes/design.ts',
        find: '  minBlockSize: controlHeight,',
        replace: "  minBlockSize: Theme.ladder('height'),",
      },
    ],
    tests,
  },
  {
    name: 'an icon button is not square on a touch screen',
    edits: [
      {
        file: '../src/recipes/button.ts',
        find: '  inlineSize: controlHeight,\n',
        replace: "  inlineSize: '2.25rem',\n",
      },
    ],
    tests,
  },
  {
    name: 'a toast’s close button is only as large as it is drawn',
    edits: [
      { file: '../src/recipes/toast.ts', find: "      fingerTarget('-10px'),\n", replace: '' },
    ],
    tests,
  },
  {
    name: 'a control’s words are selected by a double tap',
    edits: [
      {
        file: '../../mixins/src/defaults.ts',
        find: '{-webkit-user-select:none;user-select:none}',
        replace: '{}',
      },
    ],
    tests: ['packages/mixins-ui/test/selection.browser.test.ts'],
  },
]
