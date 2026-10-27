/**
 * The checkbox group's targets, broken in turn: `pnpm mutate examples/widgets/test/checkboxGroup.browser.mutations.ts`.
 */
const file = '../src/style.ts'
const tests = ['examples/widgets/test/checkboxGroup.browser.test.ts']

export default [
  {
    name: 'an option is only as tall as its words',
    edits: [
      {
        file,
        find: "          gap: '0.5rem',\n          minBlockSize: '1.5rem',\n",
        replace: "          gap: '0.5rem',\n",
      },
    ],
    tests,
  },
  {
    name: 'the box is the browser’s 13px',
    edits: [
      { file, find: "          inlineSize: '1rem',\n          blockSize: '1rem',\n", replace: '' },
    ],
    tests,
  },
]
