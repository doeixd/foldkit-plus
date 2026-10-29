/**
 * An unledgered pinned update sent again, its clock fields left out of the
 * retry comparison (#291), broken in turn:
 * `pnpm mutate packages/remote-drizzle/test/clockedRetry.mutations.ts`.
 */
const tests = ['packages/remote-drizzle/test/clockedRetry.test.ts']

export default [
  {
    name: 'a retry is compared on the time it was stamped with',
    edits: [{ file: '../src/index.ts', find: 'clocked.has(key) || ', replace: '' }],
    tests,
  },
  {
    name: 'a binding names no field set from the clock',
    edits: [{ file: '../src/bind.ts', find: "set.value._tag === 'Now'", replace: 'false' }],
    tests,
  },
]
