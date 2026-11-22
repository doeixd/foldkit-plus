/**
 * A guard over another row held to its writer's store, each refusal path
 * broken in turn: `pnpm mutate packages/guard/test/overOthers.mutations.ts`.
 */
const server = '../src/server.ts'
const tests = ['packages/guard/test/overOthers.test.ts']
const edit = (name: string, find: string, replace: string, file = server) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit(
    "an update's rule over another row asks nothing of the store",
    "    const updating = overOthers(entity, 'Update')\n",
    '    const updating: ReadonlyArray<StoreRequirement> = []\n',
  ),
  edit(
    "a delete's own rule over another row asks nothing of the store",
    "      ...overOthers(entity, 'Delete'),\n",
    '',
  ),
  edit(
    "a taken row's Delete rule over another row asks nothing of the store",
    "      ...judging.flatMap(child => overOthers(child, 'Delete')),\n",
    '',
  ),
  edit(
    "an unlinked row's Update rule over another row asks nothing of the store",
    "      ...clearJudging.flatMap(({ child }) => overOthers(child, 'Update')),\n",
    '',
  ),
  edit("the guard drops its writer's own needs", '        ...(writer.needs?.(write) ?? []),\n', ''),
  edit(
    "the guard's rules are taken as read before the write",
    "            judged: 'in-statement',\n",
    "            judged: 'read-first',\n",
  ),
  edit(
    'an insert is held to the rules of an update',
    '            Insert: () => [],\n',
    '            Insert: () => updating,\n',
  ),
  edit(
    'a rule over another row is judged from the row read, not in the statement',
    '          if (reachesOther(row.guard)) return each\n',
    '          if (reachesOther(row.guard)) return always\n',
    '../src/condition.ts',
  ),
]
