/**
 * The kernel's operator edges, broken in turn:
 * `pnpm mutate packages/entity/test/operatorEdges.mutations.ts`.
 */
const expr = '../src/expr.ts'
const evaluate = '../src/evaluate.ts'
const edges = ['packages/entity/test/operatorEdges.test.ts']
const edit = (name: string, file: string, find: string, replace: string, tests = edges) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit(
    'a field expression passed on is built again from its field',
    expr,
    "if (tag === 'Field' && !Object.hasOwn(value as object, 'metadata')) {",
    'if (false) {',
    ['packages/entity/test/collation.test.ts'],
  ),
  edit(
    'a null beside a given NUL answers first',
    evaluate,
    "!isPredicate(side) && (side._tag === 'Literal' || side._tag === 'Input') && holdsNul(value),",
    'false,',
    ['packages/entity/test/query-values.test.ts'],
  ),
  edit('an order term is not counted', expr, "checkSize('orderBy', self.where, orderBy)", '', [
    'packages/entity/test/operator.test.ts',
  ]),
  edit(
    'a boolean argument is not checked',
    expr,
    "if (wanted !== 'other' && given !== 'other' && given !== wanted) {",
    "if (wanted !== 'other' && given !== 'other' && given !== wanted && given !== 'boolean' && wanted !== 'boolean') {",
  ),
  edit(
    'a constant holding a NUL is laid to each row',
    evaluate,
    'Expr.givesUnportable(...body.where, ...terms.map(term => term.expr)) ||',
    '',
  ),
  edit(
    'one row is in order whatever its keys',
    evaluate,
    'if (terms.length === 0) return [...rows]',
    'if (terms.length === 0 || rows.length < 2) return [...rows]',
  ),
  edit(
    'a value never given reaches a handled operator as undefined',
    evaluate,
    'values.map(value => (value === undefined ? null : value)),',
    'values,',
  ),
]
