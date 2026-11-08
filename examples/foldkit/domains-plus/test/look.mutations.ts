/**
 * The pruned sheet draws the page as the whole one does (#487), with the
 * prune broken: `pnpm mutate examples/foldkit/domains-plus/test/look.mutations.ts`.
 */
const prune = '../../../../packages/mixins/src/theme/prune.ts'
const tests = ['examples/foldkit/domains-plus/test/look.browser.test.ts']
// Both killed by hand on 2026-11-08 (3,829 elements drawn otherwise); `pnpm mutate` does not reach the browser's copy (#488).
const byHand = 'pnpm mutate does not reach the module the browser runs (#488); killed by hand.'

export default [
  {
    name: 'every token is pruned',
    edits: [
      { file: prune, find: 'for (const name of readsOf(outside)) kept.add(name)', replace: '' },
    ],
    tests,
    survives: byHand,
  },
  {
    name: 'a token only another token reads is pruned',
    edits: [{ file: prune, find: 'pending.push(read)', replace: '' }],
    tests,
    survives: byHand,
  },
]
