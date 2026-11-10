/**
 * The pruned sheet draws the page as the whole one does (#487), with the
 * prune broken: `pnpm mutate examples/foldkit/domains-plus/test/look.mutations.ts`.
 */
const prune = '../../../../packages/mixins/src/theme/prune.ts'
const tests = ['examples/foldkit/domains-plus/test/look.browser.test.ts']

export default [
  {
    name: 'every token is pruned',
    edits: [
      { file: prune, find: 'for (const name of readsOf(outside)) kept.add(name)', replace: '' },
    ],
    tests,
  },
  {
    name: 'a token only another token reads is pruned',
    edits: [{ file: prune, find: 'pending.push(read)', replace: '' }],
    tests,
  },
]
