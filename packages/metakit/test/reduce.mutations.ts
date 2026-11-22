const arr = '../src/ops/arr.ts'
const rows = '../src/ops/rows.ts'
const sql = '../src/sql.ts'
const tests = ['packages/metakit/test/reduce.test.ts']

const edit = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit(
    'Arr.reduce skips runtime CommutativeMonoid check',
    arr,
    "assertCommutativeMonoid(op.descriptor, 'Arr.reduce')",
    '// skipped',
  ),
  edit(
    'foldAnswers reduce does not skip null contributions',
    rows,
    'if (value === null || value === undefined) continue',
    'if (false && (value === null || value === undefined)) continue',
  ),
  edit(
    'foldAnswers reduce skips unsupported check on empty list',
    rows,
    'if (!Object.hasOwn(foreign, Node.foreignName(op))) return Node.unsupported(op)',
    'if (false && !Object.hasOwn(foreign, Node.foreignName(op))) return Node.unsupported(op)',
  ),
  edit(
    'sql reduce omits COALESCE identity wrapper',
    sql,
    'idSql => `COALESCE(${agg}, ${idSql})`',
    '_idSql => agg',
  ),
]
