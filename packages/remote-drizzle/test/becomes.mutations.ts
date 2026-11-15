/**
 * A write's postcondition in the Drizzle writer, each step broken in turn:
 * `pnpm mutate packages/remote-drizzle/test/becomes.mutations.ts`.
 */
const writer = '../src/index.ts'
const tests = [
  'packages/remote-drizzle/test/becomes.test.ts',
  'packages/remote-drizzle/test/d1.test.ts',
]
const edit = (name: string, find: string, replace: string) => ({
  name,
  edits: [{ file: writer, find, replace }],
  tests,
})

export default [
  edit(
    'the postcondition left out of the statement',
    'holdingInvariants(\n            judged,',
    'holdingInvariants(\n            invariants,',
  ),
  edit(
    'the postcondition left out of the miss classification',
    'brokenIn(judged, retried',
    'brokenIn(invariants, retried',
  ),
  edit(
    "an insert's postcondition not judged",
    'DomainEntity.judgeAgainst(\n            judging(ensures),',
    'DomainEntity.judgeAgainst(\n            invariants,',
  ),
  edit(
    'a postcondition its database cannot run accepted',
    'if (problems.length > 0) return problems',
    '',
  ),
  edit(
    'a postcondition its database cannot compile accepted',
    'if (error instanceof QueryCompileError) return [error.message]',
    'if (error instanceof QueryCompileError) return []',
  ),
]
