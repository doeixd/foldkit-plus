/**
 * A Remote domain's facts for the Module graph: `pnpm mutate packages/remote/test/graph.mutations.ts`.
 */
const tests = ['packages/remote/test/graph.test.ts']

const edit = (name: string, find: string, replace: string, file = '../src/graphFacts.ts') => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit(
    'a domain contributes no facts',
    '      facts: () => domainFacts(definition.mutations),\n',
    '',
    '../src/domain.ts',
  ),
  edit(
    'a mutation with no write ends the facts',
    '    if (write === undefined) continue\n',
    '    if (write === undefined) return { nodes, edges }\n',
  ),
  edit(
    'a write writes nothing',
    '    for (const key of written) edges.push(GraphEdge.Writes({ transition, ...member(entity, key) }))\n',
    '',
  ),
  edit(
    'a declared becomes is no to edge',
    '    for (const state of Option.toArray(write.becomes))\n',
    '    for (const state of Option.toArray(write.from))\n',
  ),
  edit(
    'an invariant reads only the row after',
    '      for (const key of new Set([...held.before, ...held.after]))\n',
    '      for (const key of new Set(held.before))\n',
  ),
]
