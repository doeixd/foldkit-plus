/**
 * What the IndexedDB replica says of its store, and the compare-and-swap that
 * keeps two tabs' writes from interleaving, each changed in turn:
 * `pnpm mutate packages/sync/test/indexedDbStore.mutations.ts`.
 */
const file = '../src/indexedDb.ts'
const tests = ['packages/sync/test/indexedDb.test.ts']

export default [
  {
    name: 'the replica is said to be serializable',
    edits: [
      { file, find: "  isolation: 'eventual',\n", replace: "  isolation: 'serializable',\n" },
    ],
    tests,
  },
  {
    name: 'a save lands over a revision it did not expect',
    edits: [{ file, find: 'if (revision !== expectedRevision) {', replace: 'if (false) {' }],
    tests,
  },
]
