/**
 * The law over the notebook's writes, its client broken in turn:
 * `pnpm mutate examples/reference/test/law.mutations.ts`.
 */
const tests = ['examples/reference/test/law.test.ts']
const edit = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit(
    'the page counts a new note twice',
    '../../../packages/remote/src/mutation.ts',
    'count(to.value, owner, field, 1)',
    'count(to.value, owner, field, 2)',
  ),
  edit(
    'the page dates a note a moment late',
    '../../../packages/remote/src/writes.ts',
    '              now: Option.fromUndefinedOr(options.now),',
    '              now: Option.map(Option.fromUndefinedOr(options.now), at => at + 1),',
  ),
  edit(
    'the page places a new note by the order reversed',
    '../../../packages/remote/src/placement.ts',
    'if (sign.value < 0) {',
    'if (sign.value > 0) {',
  ),
]
