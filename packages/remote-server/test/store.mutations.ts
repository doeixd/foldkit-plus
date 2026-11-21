/**
 * The store a rule over other rows needs, each step of the refusal broken in turn:
 * `pnpm mutate packages/remote-server/test/store.mutations.ts`.
 */
const server = '../src/index.ts'
const memory = '../src/memoryWriter.ts'
const tests = ['packages/remote-server/test/store.test.ts']
const edit = (name: string, find: string, replace: string, file = server) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit(
    'a store that cannot serialize a parent is let through',
    '      mount(writer.store, reaching)\n',
    '',
  ),
  edit(
    'a writer naming no store is let through',
    '      if (writer.store === undefined) {',
    '      if (writer.store === undefined) return undefined as never\n      if (false) {',
  ),
  edit(
    'a precondition reading other rows asks nothing',
    "onSome: when => (Query.dependencies(when).reaches.length > 0 ? ['precondition'] : []),",
    'onSome: () => [],',
  ),
  edit(
    'a precondition reading its own row asks for a serialized parent',
    "onSome: when => (Query.dependencies(when).reaches.length > 0 ? ['precondition'] : []),",
    "onSome: () => ['precondition'],",
  ),
  edit(
    'an invariant reading other rows asks nothing',
    '.filter(held => dependenciesOf(held.predicate).reaches.length > 0)',
    '.filter(() => false)',
  ),
  edit(
    'the memory writer names a store that merges writes later',
    "store: { name: 'memory', isolation: 'serializable', parentRowLock: false },",
    "store: { name: 'memory', isolation: 'eventual', parentRowLock: false },",
    memory,
  ),
]
