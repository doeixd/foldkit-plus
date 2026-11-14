/**
 * A Remote domain's declared laws in the Module graph: `pnpm mutate packages/remote/test/graph.mutations.ts`.
 */
const tests = ['packages/remote/test/graph.test.ts']

const edit = (name: string, find: string, replace: string, file = '../../entity/src/laws.ts') => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit(
    'a domain declares no write',
    '          write === undefined ? [] : [{ name, write }],',
    '          [],',
    '../src/domain.ts',
  ),
  edit(
    'a write writes nothing',
    '    for (const key of written) edge(LawEdge.Writes({ transition: by, ...member(key) }))\n',
    '',
  ),
  edit(
    'a declared becomes is no to edge',
    '    for (const state of Option.toArray(entry.write.becomes))',
    '    for (const state of Option.toArray(entry.write.from))',
  ),
  edit(
    'an invariant reads only the row before',
    '      for (const key of readOf(held)) edge(LawEdge.Reads({ law: id, ...member(key) }))',
    '      for (const key of held.before) edge(LawEdge.Reads({ law: id, ...member(key) }))',
  ),
  edit(
    'a delete is of no Entity in the graph',
    '      ...(entity === undefined ? [] : [entity]),\n',
    '',
    '../../surface/src/graph.ts',
  ),
  edit(
    'lawFactsOf names no Entity on a transition',
    "    node(LawNode.Transition({ id: by, kind: 'write', entity: entity.name }))",
    "    node(LawNode.Transition({ id: by, kind: 'write', entity: '' }))",
  ),
]
