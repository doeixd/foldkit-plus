/**
 * A document's facts for the Module graph: `pnpm mutate packages/sync/test/graph.mutations.ts`.
 */
const tests = ['packages/sync/test/graph.test.ts']

const edit = (name: string, find: string, replace: string) => ({
  name,
  edits: [{ file: '../src/make.ts', find, replace }],
  tests,
})

export default [
  edit('a document contributes no facts', '      facts: () =>\n', '      facts2: () =>\n'),
  edit(
    'a server-only tag is no transition',
    '          tags: messages,\n',
    '          tags: durable.tags,\n',
  ),
  edit(
    'a law reads nothing',
    "        document.paths.map(path => GraphEdge.Reads({ law, space: 'model', path })),\n",
    '        [],\n',
  ),
]
