/**
 * Planning a field only a pending layer holds, broken in turn:
 * `pnpm mutate packages/remote/test/layerOnlyField.mutations.ts`.
 */
const tests = [
  'packages/remote/test/layerOnlyField.test.ts',
  'packages/remote/test/pendingDelete.test.ts',
  'packages/remote/test/heldValue.test.ts',
]
const optimistic = '../src/optimistic.ts'

export default [
  {
    name: 'a read plans over the visible store',
    edits: [
      {
        file: '../src/index.ts',
        find: 'plan(plannedStoreOf(remote.entities, remote.optimistic, visible), read, options)',
        replace: 'plan(visible, read, options)',
      },
    ],
    tests,
  },
  {
    name: 'a patched row is planned as shown',
    edits: [
      {
        file: optimistic,
        find: 'next[key] = { ...under, values: shown.values }',
        replace: 'next[key] = shown',
      },
    ],
    tests,
  },
  {
    name: 'a patched row follows the relations the server holds',
    edits: [
      {
        file: optimistic,
        find: 'next[key] = { ...under, values: shown.values }',
        replace: 'next[key] = under',
      },
    ],
    tests,
  },
  {
    name: 'a row a layer deletes is planned',
    edits: [
      {
        file: optimistic,
        find: 'shown === undefined || shown.tombstone)',
        replace: 'shown === undefined)',
      },
    ],
    tests,
  },
]
