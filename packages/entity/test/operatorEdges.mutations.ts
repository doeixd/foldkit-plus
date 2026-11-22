/**
 * The kernel's operator edges, broken in turn:
 * `pnpm mutate packages/entity/test/operatorEdges.mutations.ts`.
 */
const query = '../src/expr/query.ts'
const operator = '../src/expr/operator.ts'
const evaluate = '../src/evaluate.ts'
const edges = ['packages/entity/test/operatorEdges.test.ts']
const edit = (name: string, file: string, find: string, replace: string, tests = edges) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit('an order term is not counted', query, "checkSize('orderBy', self.where, all)", '', [
    'packages/entity/test/operator.test.ts',
  ]),
  edit(
    'a boolean argument is not checked',
    operator,
    "if (wanted !== 'other' && given !== 'other' && given !== 'null' && given !== wanted) {",
    "if (wanted !== 'other' && given !== 'other' && given !== 'null' && given !== wanted && given !== 'boolean' && wanted !== 'boolean') {",
  ),
  edit('a constant holding a NUL is laid to each row', evaluate, 'givesUnportable(...read) ||', ''),
  edit(
    'one row is in order whatever its keys',
    '../src/rowOrder.ts',
    'if (terms.length === 0) return [...rows]',
    'if (terms.length === 0 || rows.length < 2) return [...rows]',
  ),
]
