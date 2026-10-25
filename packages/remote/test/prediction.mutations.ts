/**
 * A pending increment's prediction, each step broken in turn:
 * `pnpm mutate packages/remote/test/prediction.mutations.ts` checks that a
 * test fails for every one.
 */
const tests = [
  'packages/remote/test/precondition.test.ts',
  'packages/remote/test/pendingPlacement.test.ts',
]
const edit = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit(
    'a write predicts no increment',
    '../src/mutation.ts',
    ': { ...patch, adds: bound.increments }',
    ': patch',
  ),
  edit('the amount is not added', '../src/optimistic.ts', 'current + amount', 'current'),
  edit(
    'an earlier layer is not added to',
    '../src/optimistic.ts',
    'Object.hasOwn(earlier, field)',
    'false',
  ),
  edit(
    'a list places the amount, not the sum',
    '../src/index.ts',
    '{ entities: resolvedPatches(remote.entities, remote.optimistic) },',
    '{ entities: layers.flatMap(layer => layer.patches) },',
  ),
]
