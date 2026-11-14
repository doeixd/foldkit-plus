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
    'a domain joins no write’s facts',
    'definition.mutations.flatMap(mutation => mutation[Facts]?.() ?? [])',
    '[] as ReadonlyArray<never>',
    '../src/domain.ts',
  ),
  edit(
    'a declared write holds no facts',
    '    [Facts]: () => writeFacts(name, write),\n',
    '',
    '../src/mutationDescriptor.ts',
  ),
  edit(
    'a write writes nothing',
    '      ...written.map(key => GraphEdge.Writes({ transition, ...member(key) })),\n',
    '',
  ),
  edit(
    'a declared becomes is no to edge',
    '      ...Option.toArray(write.becomes).map(state =>',
    '      ...Option.toArray(write.from).map(state =>',
  ),
  edit(
    'an invariant reads only the row before',
    '        [...new Set([...held.before, ...held.after])].map(key =>',
    '        [...new Set(held.before)].map(key =>',
  ),
]
