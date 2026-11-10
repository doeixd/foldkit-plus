/**
 * `queryPlans` reads each page as the database plans it (#437), each step
 * broken in turn: `pnpm mutate packages/remote-drizzle/test/plans.mutations.ts`.
 */
const tests = ['packages/remote-drizzle/test/plans.test.ts']
const plans = '../src/plans.ts'
const index = '../src/index.ts'
const edit = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit('a Postgres sort is not seen', plans, 'plan.some(line => /\\bSort\\b/.test(line))', 'false'),
  edit(
    'a SQLite sort is not seen',
    plans,
    "plan.some(step => step.includes('TEMP B-TREE'))",
    'false',
  ),
  edit(
    'a body with no order chosen is not planned',
    plans,
    '{ ...asked, [chosen.sort.key]: null },',
    '',
  ),
  edit(
    'a chosen order is planned in one direction',
    plans,
    "(['asc', 'desc'] as const)",
    "(['asc'] as const)",
  ),
  edit(
    'no later page is planned',
    plans,
    'if (last === undefined) return [firstPlan]',
    'return [firstPlan]',
  ),
  edit(
    'Postgres may scan a small table',
    plans,
    'await tx.execute(sql`set local enable_seqscan = off`)',
    '',
  ),
  edit(
    'a source is not registered',
    index,
    'declarations.set(declared, {',
    'new Map().set(declared, {',
  ),
  edit('no statement is observed', index, 'if (Option.isSome(observe)) observe.value(built)', ''),
]
