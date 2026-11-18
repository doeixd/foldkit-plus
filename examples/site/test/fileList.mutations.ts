/**
 * The FileInput examples' list, broken in turn: `pnpm mutate
 * examples/site/test/fileList.mutations.ts`.
 */
const tests = ['examples/site/test/fileList.test.ts']
const file = '../src/snippets/fileList.ts'

const mutation = (name: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  mutation(
    'a single file picker keeps every pick',
    'FileInput.added(model.files, files, options)',
    'FileInput.added(model.files, files, { multiple: true })',
  ),
  mutation(
    'a remove drops every file of the same name',
    'held => held !== file',
    'held => held.name !== file.name',
  ),
  mutation(
    'a remove does not put focus back on the input',
    'commands: [...synced(kept), ...focus]',
    'commands: [...synced(kept)]',
  ),
]
