/**
 * The law over Chirp's writes, its client broken in turn:
 * `pnpm mutate examples/chirp/test/law.mutations.ts`.
 */
const tests = ['examples/chirp/test/law.test.ts']
const edit = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit(
    "the page judges a guard's link by its ref key",
    '../../../packages/remote/src/held.ts',
    '        ? Held.of(idOfRef(value, `${entity.name}.${key}`))',
    '        ? Held.of(value)',
  ),
  edit(
    'the page counts a like twice',
    '../../../packages/remote/src/mutation.ts',
    'count(to.value, owner, field, 1)',
    'count(to.value, owner, field, 2)',
  ),
  edit(
    'the page places a new chirp by the order reversed',
    '../../../packages/remote/src/placement.ts',
    'if (sign.value < 0) {',
    'if (sign.value > 0) {',
  ),
]
