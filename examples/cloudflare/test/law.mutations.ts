/**
 * The law over the page's writes, the page broken in turn:
 * `pnpm mutate examples/cloudflare/test/law.mutations.ts`.
 */
const tests = ['examples/cloudflare/test/law.test.ts']
const edit = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit(
    'the page places a new or renamed todo by the order reversed',
    '../../../packages/remote/src/placement.ts',
    'if (sign.value < 0) {',
    'if (sign.value > 0) {',
  ),
  edit(
    'the page shows a pending delete as nothing',
    '../../../packages/remote/src/mutation.ts',
    "return [{ _tag: 'Delete', entity, id }]",
    'return [{ entity, id, values: {} }]',
  ),
]
