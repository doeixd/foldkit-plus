/**
 * K20 (#674) mutations proving `k20-sql-safe-range.test.ts` catches each way
 * non-integer or product arithmetic could lose its safe-integer guard or
 * corrupt in-range fractional/boundary values:
 *   `pnpm mutate packages/metakit/test/k20-sql-safe-range.mutations.ts`
 */
const lowering = '../src/sqlLowering.ts'
const tests = ['packages/metakit/test/k20-sql-safe-range.test.ts']

const mutation = (name: string, find: string, replace: string) => ({
  name,
  edits: [{ file: lowering, find, replace }],
  tests,
})

export default [
  mutation(
    'the guard is dropped for num.mul',
    "'num.mul': exact('*'),",
    "'num.mul': numeric(() => '*'),",
  ),
  mutation(
    'the guard is dropped for a Finite term in num.add, num.sub and num.mul',
    'both(args, ctx, (l, r) => clampSafe(ctx.dialect, q`(${l} ${operator} ${r})`)),',
    'both(args, ctx, (l, r) => q`(${l} ${operator} ${r})`),',
  ),
  mutation(
    'fractional terms are routed through the integer bigint path',
    'if (integers) {',
    'if (true) {',
  ),
  mutation(
    'the clamp stop is MAX_SAFE_INTEGER so boundary values become NULL',
    'const PAST_SAFE = String(Number.MAX_SAFE_INTEGER + 1)',
    'const PAST_SAFE = String(Number.MAX_SAFE_INTEGER)',
  ),
  mutation(
    'Postgres drops the negative unsafe-range NULLIF',
    'q`NULLIF(NULLIF(LEAST(GREATEST(${expr}, -${PAST_SAFE}), ${PAST_SAFE}), ${PAST_SAFE}), -${PAST_SAFE})`',
    'q`NULLIF(LEAST(GREATEST(${expr}, -${PAST_SAFE}), ${PAST_SAFE}), ${PAST_SAFE})`',
  ),
  mutation(
    'SQLite drops the negative unsafe-range NULLIF',
    'q`NULLIF(NULLIF(max(min(${expr}, ${PAST_SAFE}), -${PAST_SAFE}), ${PAST_SAFE}), -${PAST_SAFE})`',
    'q`NULLIF(max(min(${expr}, ${PAST_SAFE}), -${PAST_SAFE}), ${PAST_SAFE})`',
  ),
]
