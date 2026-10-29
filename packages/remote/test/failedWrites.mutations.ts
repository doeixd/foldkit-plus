/**
 * Failed writes in the ledger, broken in turn:
 * `pnpm mutate packages/remote/test/failedWrites.mutations.ts` checks that a
 * test fails for every one.
 */
const tests = ['packages/remote/test/failedWrites.test.ts']

export default [
  {
    name: 'a started write is not recorded',
    edits: [
      {
        file: '../src/mutation.ts',
        find: '  writes: write === undefined ? state.writes : new Map([...state.writes, [requestId, write]]),',
        replace: '  writes: state.writes,',
      },
    ],
    tests,
  },
  {
    name: 'Data.mutate names no write',
    edits: [
      {
        file: '../src/model.ts',
        find: '          message.write === undefined',
        replace: '          true',
      },
    ],
    tests,
  },
  {
    name: 'a failure drops the writes still in flight',
    edits: [
      {
        file: '../src/mutation.ts',
        find: 'if (!failed.has(id) && !pending.has(id)) writes.delete(id)',
        replace: 'if (!failed.has(id)) writes.delete(id)',
      },
    ],
    tests,
  },
  {
    name: 'writes outlive the failure window',
    edits: [
      {
        file: '../src/mutation.ts',
        find: '  for (const id of writes.keys()) if (!failed.has(id) && !pending.has(id)) writes.delete(id)\n',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'an applied retry stays listed',
    edits: [
      {
        file: '../src/mutation.ts',
        find: '      ...forgetFailure(state, requestId),\n',
        replace: '      ...state,\n',
      },
    ],
    tests,
  },
  {
    name: 'a write in flight is listed',
    edits: [
      {
        file: '../src/index.ts',
        find: 'if (write === undefined || error === undefined || mutations.pending.has(requestId))',
        replace: 'if (write === undefined || error === undefined)',
      },
    ],
    tests,
  },
  {
    name: 'a mutation narrows nothing',
    edits: [
      {
        file: '../src/index.ts',
        find: '        if (mutation !== undefined && write.mutation !== mutation.name) return []\n',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a refusal is not decoded',
    edits: [
      {
        file: '../src/index.ts',
        find: '            refusal: refusalOf(error, descriptor),',
        replace: '            refusal: Option.none(),',
      },
    ],
    tests,
  },
  {
    name: 'a write in flight is retried',
    edits: [
      {
        file: '../src/index.ts',
        find: "      if (write === undefined || mutationStatus(mutations, requestId)._tag !== 'Failed')",
        replace: '      if (write === undefined)',
      },
    ],
    tests,
  },
  {
    name: 'a retry shows nothing optimistic',
    edits: [
      {
        file: '../src/index.ts',
        find: '          optimistic: write.optimistic,\n',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a retry sends no keys',
    edits: [
      {
        file: '../src/index.ts',
        find: '          keys: write.keys,\n          // The same time',
        replace: '          // The same time',
      },
    ],
    tests,
  },
  {
    name: 'a retry is a new request',
    edits: [
      {
        file: '../src/index.ts',
        find: '          requestId,\n          optimistic: write.optimistic,',
        replace: '          optimistic: write.optimistic,',
      },
    ],
    tests,
  },
  {
    name: 'a folded retry answers unwrapped',
    edits: [
      {
        file: '../src/index.ts',
        find: '          started => ({ ...started, command: mapMessage(started.command, toParentMessage) }),',
        replace: '          started => started as never,',
      },
    ],
    tests,
  },
  {
    name: 'a write not failed is dismissed',
    edits: [
      {
        file: '../src/index.ts',
        find: "      if (mutationStatus(remote.mutations, requestId)._tag !== 'Failed') return model\n",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a dismissal forgets nothing',
    edits: [
      {
        file: '../src/index.ts',
        find: '        mutations: forgetFailure(remote.mutations, requestId),',
        replace: '        mutations: remote.mutations,',
      },
    ],
    tests,
  },
  {
    name: 'the wiring shares nothing',
    edits: [
      {
        file: '../src/index.ts',
        find: '      shared: options.shared ?? [],',
        replace: '      shared: [],',
      },
    ],
    tests,
  },
]
