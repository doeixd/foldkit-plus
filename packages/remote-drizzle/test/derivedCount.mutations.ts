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
    'if (Object.hasOwn(counts, field))\n            fail(\n              `derived "${field}" on entity "${name}" is a Derived.count',
    'if (false)\n            fail(\n              `derived "${field}" on entity "${name}" is a Derived.count',
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
  edit(
    'a write names no row it points at',
    '../../remote-server/src/index.ts',
    'return changes ? [relation.key] : []',
    'return []',
  ),
  edit(
    'an update names only where its row points after',
    '../../remote-server/src/index.ts',
    '                    ...before,\n',
    '',
  ),
  edit(
    'an update names only where its row pointed before',
    '../../remote-server/src/index.ts',
    '                    ...(yield* pointedAt(bound.id, principal)),\n',
    '',
  ),
  edit(
    'a delete names nothing',
    '../../remote-server/src/index.ts',
    "return outcome === 'deleted' ? naming(gone, before) : gone",
    'return naming(gone, [])',
  ),
  edit(
    'an insert names nothing',
    '../../remote-server/src/index.ts',
    'return naming(yield* answered(bound, row), yield* pointedAt(bound.id, principal))',
    'return yield* answered(bound, row)',
  ),
  edit(
    'the answer reads no row it points at',
    '../../remote-server/src/index.ts',
    'for (const row of outcome.pointed ?? []) name(row.entity, row.id, [])',
    '',
  ),
]
