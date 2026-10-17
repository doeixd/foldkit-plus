/**
 * The loading ring's turn the Spinner, Progress and Thinking Steps share,
 * broken in turn: `pnpm mutate packages/mixins-ui/test/turning.mutations.ts`
 * checks that a test fails for every one.
 */
const design = '../src/recipes/design.ts'
const spinner = 'packages/mixins-ui/test/spinner.test.ts'
const browser = [
  'packages/mixins-ui/test/spinner.browser.test.ts',
  'packages/mixins-ui/test/progress.browser.test.ts',
  'packages/mixins-ui/test/thinkingSteps.browser.test.ts',
]

export default [
  {
    name: 'the ring stops turning',
    edits: [{ file: design, find: "to: { rotate: '360deg' }", replace: "to: { rotate: '0deg' }" }],
    tests: [spinner],
  },
  {
    name: 'the turn ignores travel',
    edits: [
      {
        file: design,
        find: '{ animation: `${spin.name} ${travelled(cycle)} linear infinite` }',
        replace: '{ animation: `${spin.name} ${cycle} linear infinite` }',
      },
    ],
    tests: browser,
  },
  {
    name: 'the turn runs under reduced motion',
    edits: [
      {
        file: design,
        find: '    stillWhenReduced(when),\n',
        replace: '',
      },
    ],
    tests: browser,
  },
  {
    name: 'the turn runs whatever state it is given',
    edits: [
      {
        file: design,
        find: 'Style.nest(when, { animation: `',
        replace: "Style.nest('&', { animation: `",
      },
    ],
    tests: browser,
  },
]
