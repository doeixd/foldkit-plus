/**
 * A `one` relation as an operand, broken in turn:
 * `pnpm mutate packages/entity/test/link.mutations.ts`.
 */
const tests = ['packages/entity/test/link.test.ts']
const expr = '../src/expr.ts'
const edit = (name: string, find: string, replace: string) => ({
  name,
  edits: [{ file: expr, find, replace }],
  tests,
})

export default [
  edit('a relation is read as a literal', "if (tag === 'Relation') {", 'if (false) {'),
  edit(
    'a many relation is read as a link',
    "    if (relation.cardinality !== 'one') {\n      throw new Error(\n        `[foldkit-entity] ${relation.owner.name}.${relation.key} is a many relation",
    '    if (false) {\n      throw new Error(\n        `[foldkit-entity] ${relation.owner.name}.${relation.key} is a many relation',
  ),
  edit('a list orders by a link', "if (tagOf(expr) === 'Relation') {", 'if (false) {'),
  edit(
    "a link is read under the target's key",
    'key: relation.key,\n',
    'key: relation.target().name,\n',
  ),
]
