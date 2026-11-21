/**
 * `May.answer`, the `Verdict` made where a decoded `may` is read, broken in
 * turn: `pnpm mutate packages/guard/test/mayWire.mutations.ts`.
 */
const file = '../src/may.ts'
const tests = ['packages/guard/test/mayWire.test.ts']
const edit = (name: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit(
    'a yes is read as a no',
    'onSome: said => (said ? Verdict.True() : Verdict.False<never>()),',
    'onSome: said => (said ? Verdict.False<never>() : Verdict.True()),',
  ),
  edit(
    'an interaction the answer does not say is read as a no',
    'onNone: () => Verdict.Unknown(`the answer does not say ${interaction}`),',
    'onNone: () => Verdict.False<never>(),',
  ),
]
