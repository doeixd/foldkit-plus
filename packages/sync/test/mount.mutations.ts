/**
 * `Mounted.settled`, each broken in turn: `pnpm mutate packages/sync/test/mount.mutations.ts` checks that a
 * test fails for every one.
 */
export default [
  {
    name: 'a dispatch is not waited for',
    edits: [{ file: '../src/mount.ts', find: '    dispatchesOwed === 0 &&\n', replace: '' }],
    tests: ['packages/sync/test/mount.test.ts'],
  },
  {
    name: 'a persist is not waited for',
    edits: [{ file: '../src/mount.ts', find: '    persistsOwed === 0 &&\n', replace: '' }],
    tests: ['packages/sync/test/mount.test.ts'],
  },
  {
    name: "the replica's status is not waited for",
    edits: [
      {
        file: '../src/mount.ts',
        find: '    !sharedChanged(applied, Effect.runSync(replica.status))',
        replace: '    true',
      },
    ],
    tests: ['packages/sync/test/mount.test.ts'],
  },
  {
    name: 'an applied status is not recorded',
    edits: [{ file: '../src/mount.ts', find: '        applied = message.status\n', replace: '' }],
    tests: ['packages/sync/test/mount.test.ts'],
  },
  {
    name: 'an unchanged transition says nothing',
    edits: [
      {
        file: '../src/mount.ts',
        find: '    queueMicrotask(notifySettled)\n    return { model }',
        replace: '    return { model }',
      },
    ],
    tests: ['packages/sync/test/mount.test.ts'],
  },
  {
    name: 'dispose keeps the waiters',
    edits: [
      {
        file: '../src/mount.ts',
        find: "        waiter.reject(new Error('Sync.mount: disposed before it settled'))\n",
        replace: '',
      },
    ],
    tests: ['packages/sync/test/mount.test.ts'],
  },
  {
    name: 'a reset is never told',
    edits: [
      {
        file: '../src/mount.ts',
        find: '        return reinstalled(install(model), model, { reset })',
        replace: '        return reinstalled(install(model), model, { reset: false })',
      },
    ],
    tests: ['packages/sync/test/mount.test.ts'],
  },
]
