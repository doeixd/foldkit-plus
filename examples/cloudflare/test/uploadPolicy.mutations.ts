/**
 * The worker's upload policy, broken in turn:
 * `pnpm mutate examples/cloudflare/test/uploadPolicy.mutations.ts` checks
 * that a test fails for every one.
 */
const policy = '../src/uploadPolicy.ts'
const tests = ['examples/cloudflare/test/uploadPolicy.test.ts']

export default [
  {
    name: 'anyone may upload',
    edits: [{ file: policy, find: 'admitted ? Effect.void :', replace: 'true ? Effect.void :' }],
    tests,
  },
  {
    name: 'with no secret set, the unset secret spelt out uploads',
    edits: [{ file: policy, find: "(token ?? '') !== '' &&", replace: '' }],
    tests,
  },
]
