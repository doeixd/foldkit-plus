/**
 * CPU budgets, broken one piece at a time:
 * `pnpm mutate packages/plus/test/cpu.mutations.ts`
 */
const tests = ['packages/plus/test/workers.cpu.test.ts']
const file = '../src/testing/workers.ts'

const edit = (name: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit('a warm reading over budget passes', 'reading => reading.warm > warm ||', 'reading =>'),
  edit('a cold reading over budget passes', '(cold !== undefined && reading.cold > cold)', 'false'),
  edit(
    'the first request is read with the rest',
    'cold: first - start, warm: (end - first) / runs',
    'cold: (end - start) / (runs + 1), warm: (end - start) / (runs + 1)',
  ),
  edit('a failed answer is read as a cost', 'if (status >= 500)', 'if (false)'),
  edit('no runs are taken as some', 'if (!Number.isInteger(runs) || runs < 1)', 'if (false)'),
  edit(
    'two stacks started at once each read workerd',
    'for (const other of collecting) other.shared = into.shared = true',
    '',
  ),
  edit(
    'a handler in this thread costs nothing',
    'spent: async () => threadTime()',
    'spent: async () => 0',
  ),
]
