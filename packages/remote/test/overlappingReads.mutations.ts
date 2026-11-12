/**
 * What a read entry marks stale under a refreshing policy (#399), broken in
 * turn: `pnpm mutate packages/remote/test/overlappingReads.mutations.ts`
 * checks that a test fails for every one.
 */
const tests = [
  'packages/remote/test/overlappingReads.test.ts',
  'packages/remote/test/listFreshness.test.ts',
  'packages/remote/test/domain.test.ts',
  'packages/remote/test/freshness.test.ts',
  'packages/remote/test/policy.test.ts',
  'packages/remote/test/plan.test.ts',
]

export default [
  {
    name: 'the mark names every field it plans, a stale or missing one included',
    edits: [
      {
        file: '../src/plan.ts',
        find: '    if (isExpired(store, key, requirement.fields, options.freshness)) return [requirement]',
        replace: '    return [requirement]',
      },
    ],
    tests,
  },
  {
    name: 'an expired value is read again without reading Refreshing',
    edits: [
      {
        file: '../src/plan.ts',
        find: '    if (isExpired(store, key, requirement.fields, options.freshness)) return [requirement]',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a forced read marks only what aged out',
    edits: [
      {
        file: '../src/plan.ts',
        find: '  if (options.force === true) return planned\n',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a value held under another window is read again without reading Refreshing',
    edits: [
      {
        file: '../src/plan.ts',
        find: '        stored !== windowKey(window)',
        replace: '        false',
      },
    ],
    tests,
  },
  {
    name: 'a stale held list is marked again',
    edits: [
      {
        file: '../src/domain.ts',
        find: 'known.segments.length > 0 && (aged || options.force === true)',
        replace: 'known.segments.length > 0',
      },
    ],
    tests,
  },
  {
    name: 'an aged list is read again without reading Refreshing',
    edits: [
      {
        file: '../src/domain.ts',
        find: 'known.segments.length > 0 && (aged || options.force === true)',
        replace: 'known.segments.length > 0 && options.force === true',
      },
    ],
    tests,
  },
  {
    name: 'a cacheFirst read marks what it reads under another window',
    edits: [
      {
        file: '../src/domain.ts',
        find: '        refreshes: RemotePolicy.refreshes(policy) ? plan.refreshes : [],',
        replace: '        refreshes: plan.refreshes,',
      },
    ],
    tests,
  },
  {
    name: 'the mark names what was read, as before',
    edits: [
      {
        file: '../src/domain.ts',
        find: '          ...(refreshes.length > 0 || refreshing.length > 0',
        replace:
          '          ...(RemotePolicy.refreshes(policy) && (requirements.length > 0 || refreshing.length > 0)',
      },
      {
        file: '../src/domain.ts',
        find: '            ? [toMessage(refreshStarted(refreshes, refreshing))]',
        replace: '            ? [toMessage(refreshStarted(requirements, refreshing))]',
      },
    ],
    tests,
  },
  {
    name: 'a failed field a read has started since is dropped from the plan',
    edits: [
      {
        file: '../src/domain.ts',
        find: '        remote.loading.has(fieldMark(requirement.entity, requirement.id, field)),',
        replace: '        false,',
      },
    ],
    tests: [...tests, 'packages/remote/test/readFailure.test.ts'],
  },
]
