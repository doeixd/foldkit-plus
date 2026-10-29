/**
 * Keys named as `Object.prototype` members (#311), read as inherited again:
 * `pnpm mutate packages/entity/test/input.mutations.ts`.
 */
const tests = ['packages/entity/test/input.test.ts']
const edit = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})
const index = '../src/index.ts'

export default [
  edit(
    'a mapping is read for an inherited key',
    index,
    'own(given, key) ??',
    '(given as Record<string, InputMember>)[key] ??',
  ),
  edit(
    'a field is read for an inherited key',
    index,
    'own(fields, key) ??',
    '(fields as Record<string, InputMember>)[key] ??',
  ),
  edit(
    'a mapping may name an inherited key of the input',
    index,
    'if (!Object.hasOwn(schema.fields, key))',
    'if (!(key in schema.fields))',
  ),
  edit(
    'an annotation is read for an inherited key',
    index,
    'const extra = own(given, key)',
    'const extra = given[key]',
  ),
  edit(
    'Entity.fields reads an inherited key',
    index,
    '          own(\n            entity.fields as',
    '          ((record: Readonly<Record<string, EntityField<string, string, Schema.Constraint>>>, at: string) => record[at])(\n            entity.fields as',
  ),
  edit(
    'a selection reads an inherited member',
    index,
    'const member = own(members, key)',
    'const member = members[key]',
  ),
  edit(
    "a row's inherited key is its value",
    '../src/evaluate.ts',
    'field: key => own(row, key),',
    'field: key => row[key],',
  ),
]
