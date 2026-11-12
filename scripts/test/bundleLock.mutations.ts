/**
 * The dist lock: `pnpm mutate scripts/test/bundleLock.mutations.ts`.
 */
const file = '../bundle-report.mjs'
const tests = ['scripts/test/bundleLock.test.ts']

export default [
  {
    name: 'a dead holder is never replaced',
    edits: [{ file, find: 'return !isAlive(pid)', replace: 'return false' }],
    tests,
  },
  {
    name: 'every holder counts as dead',
    edits: [{ file, find: 'return !isAlive(pid)', replace: 'return true' }],
    tests,
  },
]
