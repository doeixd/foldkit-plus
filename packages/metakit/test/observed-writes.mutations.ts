const mutation = (name: string, find: string, replace: string) => ({
  name,
  edits: [{ file: '../src/transition.ts', find, replace }],
  tests: ['packages/metakit/test/observed-writes.test.ts'],
})

export default [
  mutation(
    'a keyed patch reports the whole list',
    'patch: ({ key, set }) => observePatch(path, key, set, before, after),',
    'patch: subtree,',
  ),
  mutation(
    'a no-op write is reported as a change',
    'if (observed !== undefined && !Object.is(nextState, written.success)) {',
    'if (observed !== undefined) {',
  ),
  mutation(
    'a membership change is reported as an ordinary path',
    'insert: membership,',
    'insert: subtree,',
  ),
]
