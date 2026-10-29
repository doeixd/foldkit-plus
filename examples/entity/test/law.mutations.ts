/**
 * The law over the declared edit, its client broken in turn:
 * `pnpm mutate examples/entity/test/law.mutations.ts`.
 */
const tests = ['examples/entity/test/law.test.ts']
const edit = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit(
    'the page shows an editor taken away as Ada',
    '../../../packages/remote/src/mutation.ts',
    'Option.match(link, { onNone: () => null, onSome: ref => entityKey(ref.entity, ref.id) }),',
    "Option.match(link, { onNone: () => entityKey('Author', 'a1'), onSome: ref => entityKey(ref.entity, ref.id) }),",
  ),
  edit(
    'the page places a renamed post by the order reversed',
    '../../../packages/remote/src/placement.ts',
    'if (sign.value < 0) {',
    'if (sign.value > 0) {',
  ),
]
