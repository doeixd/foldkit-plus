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
  {
    name: 'a press keeps the resting fill',
    edits: [{ file, find: '    background: fillActive,\n', replace: '' }],
    tests,
  },
  {
    name: 'a held button keeps its size',
    edits: [
      {
        file,
        find: 'scale: `calc(1 - 0.02 * ${ref.knob.travel})`',
        replace: "scale: '1'",
      },
    ],
    tests,
  },
  {
    name: 'the press scales under reduced motion too',
    edits: [
      {
        file,
        find: 'scale: `calc(1 - 0.02 * ${ref.knob.travel})`',
        replace: "scale: '0.98'",
      },
    ],
    tests,
  },
]
