/**
 * Members named as `Object.prototype`'s keys, bound by own keys alone, broken
 * in turn: `pnpm mutate packages/remote-drizzle/test/protoKeys.mutations.ts`.
 */
const tests = ['packages/remote-drizzle/test/protoKeys.test.ts']
const file = '../src/bind.ts'
const edit = (name: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit(
    'a field is looked up in the fields given by inherited keys too',
    'own(overrides, field) ??',
    'overrides[field] ??',
  ),
  edit(
    'a field is looked up in the table by inherited keys too',
    'own(tableColumns, field) ??',
    'tableColumns[field] ??',
  ),
  edit(
    'a relation is looked up in its storage by inherited keys too',
    'own(given, field) ??',
    'given[field] ??',
  ),
  edit(
    'an Entity is looked up in the storage by inherited keys too',
    'own(tables, key) ??',
    'tables[key] ??',
  ),
  edit('a member named __proto__ is bound', "if (field === '__proto__')", 'if (false)'),
]
