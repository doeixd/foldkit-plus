/**
 * A document's laws in the Module graph: `pnpm mutate packages/sync/test/graph.mutations.ts`.
 */
const tests = ['packages/sync/test/graph.test.ts']

const edit = (name: string, find: string, replace: string) => ({
  name,
  edits: [{ file: '../src/make.ts', find, replace }],
  tests,
})

export default [
  edit('a document declares no law', '      laws: { model: Object.keys(laws) },\n', ''),
  edit(
    'a server-only tag is no transition',
    '    const messages = [...durable.tags, ...serverTags]\n',
    '    const messages = [...durable.tags]\n',
  ),
]
