/**
 * `pageModelContext`, broken in turn: `pnpm mutate packages/agent-webmcp/test/pageModelContext.mutations.ts`
 * checks that a test fails for every one.
 */
const tests = ['packages/agent-webmcp/test/pageModelContext.test.ts']
const file = '../src/webmcp.ts'

export default [
  {
    name: 'the older name is not read',
    edits: [
      {
        file,
        find: ': (navigator as unknown as { modelContext?: ModelContext }).modelContext',
        replace: ': undefined',
      },
    ],
    tests,
  },
  {
    name: 'the older name wins over the spec’s',
    edits: [{ file, find: '  if (current !== undefined) return current\n', replace: '' }],
    tests,
  },
]
