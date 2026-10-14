/**
 * The table of contents, each part broken in turn: `pnpm mutate
 * packages/mixins-richtext/test/contents.mutations.ts` checks that a test fails for every one.
 */
const file = '../src/contents.ts'
const tests = ['packages/mixins-richtext/test/contents.test.ts']

export default [
  {
    name: 'depth counts from level 1, not the shallowest level used',
    edits: [{ file, find: 'String(entry.level - top + 1)', replace: 'String(entry.level)' }],
    tests,
  },
  {
    name: 'no section is marked current',
    edits: [{ file, find: 'entry.node === current ?', replace: 'false ?' }],
    tests,
  },
  {
    name: 'an empty outline draws an empty nav',
    edits: [{ file, find: 'if (entries.length === 0) return h.empty\n', replace: '' }],
    tests,
  },
]
