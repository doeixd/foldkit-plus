/**
 * The busy reveal, broken in turn:
 * `pnpm mutate packages/mixins/test/busyReveal.mutations.ts`.
 */
const tests = ['packages/mixins/test/busyReveal.browser.test.ts']
const file = '../src/utilities.ts'

export default [
  {
    name: 'the busy line shows with no delay',
    edits: [
      {
        file,
        find: 'var(--fk-motion-moderate, 160ms) ${NOTICEABLE} both',
        replace: 'var(--fk-motion-moderate, 160ms) both',
      },
    ],
    tests,
  },
  {
    name: 'the busy line is drawn before its delay ends',
    edits: [{ file, find: '${NOTICEABLE} both`', replace: '${NOTICEABLE} forwards`' }],
    tests,
  },
  {
    name: 'the delay follows the motion knob',
    edits: [
      {
        file,
        find: "const NOTICEABLE = '0.6s'",
        replace: "const NOTICEABLE = 'calc(0.6s * var(--fk-knob-motion))'",
      },
    ],
    tests,
  },
  {
    name: 'a line that is not busy is held back too',
    edits: [
      {
        file,
        find: 'nest(\'&[aria-busy="true"]\', {\n    animation: `${fadeIn.name}',
        replace: "nest('&', {\n    animation: `${fadeIn.name}",
      },
    ],
    tests,
  },
]
