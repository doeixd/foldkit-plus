/**
 * `Sync.mount`'s guards (`Mounted.settled`, `afterUpdate`), each broken in turn:
 * `pnpm mutate packages/sync/test/mount.mutations.ts` checks that a test fails for every one.
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
  {
    name: 'afterUpdate is never run',
    edits: [
      {
        file: '../src/mount.ts',
        find: 'if (options.afterUpdate === undefined) return result',
        replace: 'return result',
      },
    ],
    tests: ['packages/sync/test/mount.test.ts'],
  },
  {
    name: 'a page unloads freely while an edit waits to be stored',
    edits: [
      {
        file: '../src/mount.ts',
        find: '    if (edits.length === 1) unloadGuarded(true)\n',
        replace: '',
      },
    ],
    tests: ['packages/sync/test/mount.test.ts'],
  },
  {
    name: 'the page stays held after every edit is stored',
    edits: [
      {
        file: '../src/mount.ts',
        find: '      if (edits.length === 0) unloadGuarded(false)',
        replace: '',
      },
    ],
    tests: ['packages/sync/test/mount.test.ts'],
  },
  {
    name: 'the page is let go once the first edit is stored',
    edits: [
      {
        file: '../src/mount.ts',
        find: '      if (edits.length === 0) unloadGuarded(false)',
        replace: '      unloadGuarded(false)',
      },
    ],
    tests: ['packages/sync/test/mount.test.ts'],
  },
  {
    name: 'leaving is not stopped, only listened to',
    edits: [{ file: '../src/mount.ts', find: 'event.preventDefault()', replace: 'void event' }],
    tests: ['packages/sync/test/mount.test.ts'],
  },
]
