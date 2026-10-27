/**
 * The demos' look, broken in turn: `pnpm mutate examples/site/test/demoStyle.mutations.ts`.
 */
const file = '../src/demoStyle.ts'
const tests = ['examples/site/test/demoStyle.test.ts']

export default [
  {
    name: 'the compact theme is the standard one',
    edits: [{ file, find: "{ shape: { density: 0.85, size: 'compact' } }", replace: '{}' }],
    tests,
  },
  {
    name: 'the page starts compact',
    edits: [{ file, find: "{ initial: 'standard' }", replace: "{ initial: 'compact' }" }],
    tests,
  },
]
