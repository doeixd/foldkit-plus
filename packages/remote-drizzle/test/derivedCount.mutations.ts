/**
 * `bind` compiling a `Derived.count`, each step broken in turn:
 * `pnpm mutate packages/remote-drizzle/test/derivedCount.mutations.ts`.
 */
const tests = ['packages/remote-drizzle/test/derivedCount.test.ts']
const edit = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit(
    'a count entry is accepted',
    '../src/bind.ts',
    'if (Object.hasOwn(counts, field))',
    'if (false)',
  ),
  edit(
    'the count is not compiled',
    '../src/bind.ts',
    'return Option.some(pointing(relation, name, field, columns.id))',
    'return Option.none()',
  ),
  edit(
    'an unbound pointing Entity is let through',
    '../src/bind.ts',
    'Object.keys(entities).find(key => entities[key]!.identity.token === relation.owner.token) ??',
    "Object.keys(entities).find(key => entities[key]!.identity.token === relation.owner.token) ?? 'Comment' ??",
  ),
  edit(
    'the count reads the owner relation of its name',
    '../src/index.ts',
    "const relation = computed.over ?? binding.relations[computed.relation]\n          if (relation === undefined || relation.kind === 'one') {",
    "const relation = binding.relations[computed.relation]\n          if (relation === undefined || relation.kind === 'one') {",
  ),
]
