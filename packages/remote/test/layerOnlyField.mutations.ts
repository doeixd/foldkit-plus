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
  {
    name: 'a row only a pending request holds is asked of the server',
    edits: [
      {
        file: '../src/index.ts',
        find: '!held.has(entityKey(requirement.entity, requirement.id))',
        replace: 'true',
      },
    ],
    tests,
  },
  {
    name: 'a row read as absent under a pending request is asked of the server',
    edits: [
      {
        file: optimistic,
        find: 'if (under === undefined || under.tombstone) held.add(key)',
        replace: 'if (under === undefined) held.add(key)',
      },
    ],
    tests,
  },
  {
    name: 'a row the server holds under a pending request is not asked of it',
    edits: [
      {
        file: optimistic,
        find: 'if (under === undefined || under.tombstone) held.add(key)',
        replace: 'held.add(key)',
      },
    ],
    tests,
  },
]
