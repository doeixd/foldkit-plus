/** The waitlist's strict submit, broken: `pnpm mutate examples/foldkit/form/test/strictSubmit.mutations.ts`. */
const main = '../src/main.ts'
const strict = 'examples/foldkit/form/test/strictSubmit.browser.test.ts'
const story = 'examples/foldkit/form/test/story.test.ts'

export default [
  {
    name: 'a submit during a check is held for the answer',
    edits: [
      {
        file: main,
        find: "if (message._tag === 'Submitted' && isChecking(model)) return { model }",
        replace: '',
      },
    ],
    tests: [strict, story],
  },
  {
    name: 'no key is ever checking',
    edits: [
      { file: main, find: 'onValidating: () => true,', replace: 'onValidating: () => false,' },
    ],
    tests: [strict, story],
  },
]
