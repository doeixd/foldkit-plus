/**
 * A repeated settlement as a no-op, broken in turn:
 * `pnpm mutate packages/remote/test/repeatedAnswer.mutations.ts`.
 */
const tests = ['packages/remote/test/repeatedAnswer.test.ts']
const file = '../src/mutation.ts'

export default [
  {
    name: 'a request not in flight can fail',
    edits: [{ file, find: '  if (!state.pending.has(requestId)) return state\n', replace: '' }],
    tests,
  },
  {
    name: 'a repeated success rebuilds the ledger',
    edits: [
      {
        file,
        find: '  if (repeated && !state.pending.has(requestId) && !state.failed.has(requestId))\n    return { store, state }\n',
        replace: '',
      },
    ],
    tests,
  },
]
