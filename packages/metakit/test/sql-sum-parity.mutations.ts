/**
 * Mutations proving `sql-sum-parity.test.ts` catches each way the SQL of
 * `num.add` and `num.sub` could go back to a sum past the safe range:
 *   `pnpm mutate packages/metakit/test/sql-sum-parity.mutations.ts`
 * They need PGlite and SQLite.
 */
const lowering = '../src/sqlLowering.ts'
const tests = ['packages/metakit/test/sql-sum-parity.test.ts']

const mutation = (name: string, find: string, replace: string) => ({
  name,
  edits: [{ file: lowering, find, replace }],
  tests,
})

export default [
  mutation(
    'an addition is left unguarded',
    "'num.add': exact('+'),",
    "'num.add': numeric(() => '+'),",
  ),
  mutation(
    'a subtraction is left unguarded',
    "'num.sub': exact('-'),",
    "'num.sub': numeric(() => '-'),",
  ),
  mutation(
    'a product is left unguarded',
    "'num.mul': exact('*'),",
    "'num.mul': numeric(() => '*'),",
  ),
  mutation(
    'a sum of fractions or of a fraction and a column is guarded too',
    'if (integers) {',
    'if (true) {',
  ),
  mutation(
    'the stop is the boundary itself, so the largest safe integer is refused',
    'const PAST_SAFE = String(Number.MAX_SAFE_INTEGER + 1)',
    'const PAST_SAFE = String(Number.MAX_SAFE_INTEGER)',
  ),
  mutation(
    'SQLite keeps a sum that reaches +2^53 or beyond',
    'min(${expr}, ${PAST_SAFE})',
    'min(${expr}, ${PAST_SAFE} + 1)',
  ),
  mutation(
    'SQLite keeps a sum that reaches -2^53 or beyond',
    'q`NULLIF(NULLIF(max(min(${expr}, ${PAST_SAFE}), -${PAST_SAFE}), ${PAST_SAFE}), -${PAST_SAFE})`',
    'q`NULLIF(max(min(${expr}, ${PAST_SAFE}), -${PAST_SAFE}), ${PAST_SAFE})`',
  ),
  mutation(
    'Postgres keeps a sum that reaches -2^53 or beyond',
    'q`NULLIF(NULLIF(LEAST(GREATEST(${expr}, -${PAST_SAFE}), ${PAST_SAFE}), ${PAST_SAFE}), -${PAST_SAFE})`',
    'q`NULLIF(LEAST(GREATEST(${expr}, -${PAST_SAFE}), ${PAST_SAFE}), ${PAST_SAFE})`',
  ),
  mutation(
    'Postgres keeps a sum that reaches +2^53 or beyond',
    'q`NULLIF(NULLIF(LEAST(GREATEST(${expr}, -${PAST_SAFE}), ${PAST_SAFE}), ${PAST_SAFE}), -${PAST_SAFE})`',
    'q`NULLIF(GREATEST(${expr}, -${PAST_SAFE}), -${PAST_SAFE})`',
  ),
  mutation(
    'Postgres sums in the columns own integer type, which raises past int4 and int8',
    '(CAST(${l} AS numeric) ${operator} ${r})',
    '(${l} ${operator} ${r})',
  ),
]
