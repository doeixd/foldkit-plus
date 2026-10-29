/**
 * `verifyPredictions`' `Value`, each step broken in turn:
 * `pnpm mutate packages/remote/test/verifyPredictions.mutations.ts`.
 */
const tests = [
  'packages/remote/test/verifyPredictions.test.ts',
  'packages/remote/test/verifyAnswers.test.ts',
]
const edit = (name: string, find: string, replace: string) => ({
  name,
  edits: [{ file: '../src/index.ts', find, replace }],
  tests,
})

export default [
  edit('no answered value disagrees', 'sameData(entry.values[field], values[field])', 'true'),
  edit('a field another request shows is judged', 'stillPatched.has(`${key}.${field}`) ||', ''),
  edit('a field the answer does not carry is judged', '!Object.hasOwn(values, field) ||', ''),
  edit(
    'what the answer read is not compared',
    'for (const row of [...answer.entities, ...(answer.read?.result.entities ?? [])]) {',
    'for (const row of answer.entities) {',
  ),
  edit(
    'a list fetched to check its placement plans no reads for a gap',
    'planAsked(unverified(after),',
    'planAsked(after,',
  ),
]
