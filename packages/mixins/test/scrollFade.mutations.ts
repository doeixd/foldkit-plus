/**
 * The scroll fade, broken in turn:
 * `pnpm mutate packages/mixins/test/scrollFade.mutations.ts`.
 */
const tests = ['packages/mixins/test/scrollFade.browser.test.ts']
const file = '../src/utilities.ts'

export default [
  {
    name: 'the start fades at the top',
    edits: [
      {
        file,
        find: "from: { '--_fk-fade-start': '1' },",
        replace: "from: { '--_fk-fade-start': '0' },",
      },
    ],
    tests,
  },
  {
    name: 'the end stays faded at the end',
    edits: [
      { file, find: "to: { '--_fk-fade-end': '1' }", replace: "to: { '--_fk-fade-end': '0' }" },
    ],
    tests,
  },
  {
    name: 'the fade follows no scroll',
    edits: [
      {
        file,
        find: 'animationTimeline: `scroll(self ${axis}), scroll(self ${axis})`,',
        replace: '',
      },
    ],
    tests,
  },
]
