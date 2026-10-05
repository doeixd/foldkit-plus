/**
 * The published demo's host, broken in turn: `pnpm mutate
 * examples/cms/test/sandbox.mutations.ts` checks that a test fails for every one.
 */
const tests = ['examples/cms/test/sandbox.browser.test.ts']
const host = '../src/server/host.ts'
export default [
  {
    name: 'a conversation answers from the database it opened on',
    edits: [
      {
        file: host,
        find: '    const now = () => ({',
        replace: '    const opened = sandbox\n    const now = () => ({',
      },
      {
        file: host,
        find: '      handlers: RemoteServer.handlers(sandbox.backend.server, principalOf(chair)),\n      database: sandbox.backend.database,',
        replace:
          '      handlers: RemoteServer.handlers(opened.backend.server, principalOf(chair)),\n      database: opened.backend.database,',
      },
    ],
    tests,
  },
  {
    name: 'a seed over what would not open is not kept',
    edits: [
      {
        file: host,
        find: '  if (Option.isNone(restored)) void keep()',
        replace: '  if (Option.isNone(kept)) void keep()',
      },
    ],
    tests,
  },
  {
    name: 'a mutation is not kept',
    edits: [
      { file: host, find: '            Effect.tap(() => Effect.sync(changed)),\n', replace: '' },
    ],
    tests,
  },
  {
    name: 'a page asking afresh resets nothing',
    edits: [{ file: host, find: '    if (fresh) reset()\n', replace: '' }],
    tests,
  },
  {
    name: 'a reset is not kept',
    edits: [{ file: host, find: '      await keep()\n', replace: '' }],
    tests,
  },
  {
    name: 'a sandbox of another edition is taken',
    edits: [
      { file: '../src/server/store.ts', find: '  record.edition === EDITION &&\n', replace: '' },
    ],
    tests,
  },
]
