const mutation = (name: string, find: string, replace: string) => ({
  name,
  edits: [{ file: '../src/aggregatesSql.ts', find, replace }],
  tests: ['packages/metakit/test/kernel-asks.test.ts'],
})

export default [
  mutation(
    'SQL sums return an unsafe final total',
    'BETWEEN ${-MAX_SAFE} AND ${MAX_SAFE}',
    'BETWEEN -9223372036854775808 AND 9223372036854775807',
  ),
  mutation(
    'SQLite sum accepts bounds that can overflow its integer accumulator',
    'BigInt(bounds.maxRows) * BigInt(bounds.maxAbsContribution) > SQLITE_MAX_INTEGER',
    'false',
  ),
  mutation(
    'SQLite sum binds its contribution parameters only once',
    'params: postgres ? params : [...params, ...params]',
    'params',
  ),
]
