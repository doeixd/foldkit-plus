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
    '    if (needed.length > 0) mount(writer.store, needed)\n',
    '',
  ),
  edit(
    'a data rule is taken as judged in the statement whatever its writer says',
    "judged: writer.judgesInStatement === true ? 'in-statement' : 'read-first',",
    "judged: 'in-statement',",
  ),
  edit(
    'a data rule is taken as read first through a writer that judges it in its statement',
    "judged: writer.judgesInStatement === true ? 'in-statement' : 'read-first',",
    "judged: 'read-first',",
  ),
  edit(
    "a writer's own rules are not held to its store",
    '      ...(writer.needs?.(write) ?? []).map(need => ({',
    '      ...([] as ReadonlyArray<StoreRequirement>).map(need => ({',
  ),
  edit(
    "a writer's own rule loses the write's name",
    '        rule: `${mutation.name} ${need.rule}`,',
    '        rule: need.rule,',
  ),
  edit(
    'a writer naming no store is let through',
    '    if (writer.store === undefined) {\n',
    '    if (false) {\n',
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
    "      name: 'memory',\n      isolation: 'serializable',",
    "      name: 'memory',\n      isolation: 'eventual',",
    memory,
  ),
  edit(
    'the memory writer says its isolation reaches one statement',
    "      name: 'memory',\n      isolation: 'serializable',\n      isolates: 'transaction',",
    "      name: 'memory',\n      isolation: 'serializable',\n      isolates: 'statement',",
    memory,
  ),
]
