/**
 * A button's press, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/press.mutations.ts`.
 */
const tests = ['packages/mixins-ui/test/press.browser.test.ts']
const file = '../src/recipes/button.ts'

export default [
  {
    name: 'a press changes nothing',
    edits: [
      {
        file,
        find: "    borderColor: 'transparent',\n    transitionDuration: ref.motion.fast,",
        replace: '    transitionDuration: ref.motion.fast,',
      },
    ],
    tests,
  },
  {
    name: 'the fill runs under the border, so a press shrinks nothing',
    edits: [{ file, find: "    backgroundClip: 'padding-box',\n", replace: '' }],
    tests,
  },
]
