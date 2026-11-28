/**
 * A `one` relation as an operand, broken in turn:
 * `pnpm mutate packages/entity/test/link.mutations.ts`.
 */
const tests = ['packages/entity/test/link.test.ts']
const operand = '../src/expr/operand.ts'
const order = '../src/expr/order.ts'
const edit = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit('a relation is read as a literal', operand, "if (tag === 'Relation') {", 'if (false) {'),
  edit(
    'a many relation is read as a link',
    operand,
    "  if (relation.cardinality !== 'one') {\n    throw new Error(\n      `[foldkit-entity] ${step}:",
    '  if (false) {\n    throw new Error(\n      `[foldkit-entity] ${step}:',
  ),
  edit(
    'a list orders by a link',
    order,
    "if ((value as { readonly _tag?: unknown } | null)?._tag === 'Relation') {",
    'if (false) {',
  ),
  edit(
    'a chosen order takes a link',
    order,
    "const expr = orderOperand(choice, 'chosen')",
    'const expr = exprOf(toNode(choice))',
  ),
  edit(
    "a link is read under the target's key",
    operand,
    "  key: relation.key,\n  // A ref's id",
    "  key: relation.target().name,\n  // A ref's id",
  ),
]
