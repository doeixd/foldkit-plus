/**
 * A capability's authorization, broken in turn:
 * `pnpm mutate packages/agent/test/authorize.mutations.ts`.
 */
const file = '../src/runtime.ts'
const tests = ['packages/agent/test/runtime.test.ts']

export default [
  {
    name: 'a refusal with a reason is taken as allowed',
    edits: [{ file, find: 'if (decided !== true) {', replace: 'if (!decided) {' }],
    tests,
  },
  {
    name: 'a refusal drops its reason',
    edits: [
      { file, find: 'decided === false ? undefined : decided.reason,', replace: 'undefined,' },
    ],
    tests,
  },
]
