/**
 * A query refuses a field of another Entity, a namesake included (#479):
 * `pnpm mutate packages/entity/test/ownership.mutations.ts`.
 */
const tests = ['packages/entity/test/expr.test.ts']
const edit = (name: string, find: string, replace: string) => ({
  name,
  edits: [{ file: '../src/expr.ts', find, replace }],
  tests,
})

export default [
  edit(
    'a field is checked by its name',
    'if (field.owner.token !== entity.identity.token) {',
    'if (field.owner.name !== entity.name) {',
  ),
  edit('a namesake is not named', 'field.owner.name === entity.name\n', 'false\n'),
]
