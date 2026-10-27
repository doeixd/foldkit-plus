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
    '...(Object.keys(bound.increments).length === 0 ? {} : { adds: bound.increments }),',
    '',
  ),
  edit(
    'the amount is not added',
    '../src/optimistic.ts',
    'increments: adds ?? {}',
    'increments: {}',
  ),
  edit(
    'an earlier layer is not added to',
    '../src/optimistic.ts',
    'Object.entries({ ...base[key]?.values, ...earlier })',
    'Object.entries({ ...base[key]?.values })',
  ),
  edit(
    'a list places the amount, not the sum',
    '../src/index.ts',
    '{ entities: resolvedPatches(remote.entities, remote.optimistic, operators) },',
    '{ entities: layers.flatMap(layer => layer.patches) },',
  ),
  {
    name: 'a field an earlier layer could not work out is read as the store holds it',
    edits: [
      {
        file: '../src/optimistic.ts',
        find: '([field]) => !unknown.has(field),',
        replace: '() => true,',
      },
    ],
    tests: ['packages/remote/test/operators.test.ts'],
  },
]
