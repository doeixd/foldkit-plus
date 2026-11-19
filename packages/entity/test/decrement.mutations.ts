/**
 * `decrement` and a `when` over the row, each broken in turn:
 * `pnpm mutate packages/entity/test/decrement.mutations.ts`.
 */
const write = '../src/write.ts'
const tests = [
  'packages/entity/test/decrement.test.ts',
  'packages/entity/test/precondition.test.ts',
  'packages/remote-drizzle/test/decrement.test.ts',
  'packages/remote-drizzle/test/bank.test.ts',
]
const edit = (name: string, find: string, replace: string, only = tests) => ({
  name,
  edits: [{ file: write, find, replace }],
  tests: only,
})

export default [
  edit('a decrement adds its amount', "direction === 'decrement' ? 0 - amount : amount", 'amount'),
  edit('a decrement of zero is minus zero', '? 0 - amount :', '? -amount :'),
  edit(
    'a decrement is read as nothing',
    "for (const direction of ['increment', 'decrement'] as const) {",
    "for (const direction of ['increment'] as const) {",
  ),
  edit(
    'a field may be both incremented and decremented',
    'if (declared.increments.some(increment => increment.field.key === fieldKey)) {',
    'if (false) {',
  ),
  edit(
    'a decrement says it increments',
    'const verb = `${direction}s`',
    "const verb = 'increments'",
  ),
  edit(
    'a decrement forgets its direction',
    'return Object.freeze({ key, field, integer, direction })',
    "return Object.freeze({ key, field, integer, direction: 'increment' as const })",
  ),
  edit(
    'a when is given no row',
    'condition({ row, input: placeholders as never })',
    'condition({ row: {} as never, input: placeholders as never })',
    // The bank's writes are declared as its module loads, which this mutation makes throw.
    tests.filter(test => !test.endsWith('bank.test.ts')),
  ),
]
