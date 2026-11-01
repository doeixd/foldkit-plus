/**
 * `verifyPredictions`' Placement, broken in turn:
 * `pnpm mutate packages/remote/test/verifyPlacement.mutations.ts`.
 */
const tests = ['packages/remote/test/verifyPlacement.test.ts']
const index = '../src/index.ts'
const model = '../src/model.ts'

export default [
  {
    name: 'a verified placement is not fetched',
    edits: [
      {
        file: '../src/remote.ts',
        find: 'invalidateConnections(withPlaced, [...invalidated, ...identities])',
        replace: 'invalidateConnections(withPlaced, invalidated)',
      },
    ],
    tests,
  },
  {
    name: 'every placement is verified',
    edits: [
      {
        file: '../src/remote.ts',
        find: '        verify.on &&\n        !verify.expects(',
        replace: '        !verify.expects(',
      },
    ],
    tests,
  },
  {
    name: 'a placement always agrees',
    edits: [
      {
        file: model,
        find: 'served.every((key, index) => key === asPlaced[index]) &&',
        replace: 'true &&',
      },
    ],
    tests,
  },
  {
    name: 'a compared order is kept',
    edits: [{ file: model, find: '    placed: rest,', replace: '    placed: model.placed,' }],
    tests,
  },
  {
    name: 'a placement a read made is not checked',
    edits: [
      {
        file: '../src/remote.ts',
        find: 'capabilities.bodies.value.news(lists, remote, news, before, context),\n          [],\n        )',
        replace:
          '{},\n          [],\n        ) && { ...remote, connections: { ...remote.connections, ...capabilities.bodies.value.news(lists, remote, news, before, context) } }',
      },
    ],
    tests,
  },
  {
    name: 'a row placing took out is not compared',
    edits: [{ file: model, find: '!placed.dropped.some(key => listed.has(key))', replace: 'true' }],
    tests,
  },
  {
    name: 'placing records nothing it took out',
    edits: [
      {
        file: '../src/remote.ts',
        find: 'dropped: firstPage(remote.connections[identity]).filter(key => !kept.has(key)),',
        replace: 'dropped: [],',
      },
    ],
    tests,
  },
  {
    name: 'a list stale only for its check reads Refreshing',
    edits: [
      {
        file: '../src/model.ts',
        find: '  remote.placed[identity]?.checking !== true &&\n',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'an invalidation leaves a list read as stale only for its check',
    edits: [
      {
        file: '../src/model.ts',
        find: '    placed: withoutChecking(model.placed, connection),\n',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a checked list is never stale for its check alone',
    edits: [
      {
        file: '../src/remote.ts',
        find: 'checking: !invalidatedAnyway.has(identity),',
        replace: 'checking: false,',
      },
    ],
    tests,
  },
  {
    name: 'why says a list stale only for its check is stale',
    edits: [
      {
        file: '../src/whyReasons.ts',
        find: 'if (readsStale(remote, identity)) reasons.push',
        replace: 'if (connection.stale) reasons.push',
      },
    ],
    tests,
  },
  {
    name: 'a read is kept across a change of what its list is checked for',
    edits: [
      {
        file: '../src/remote.ts',
        find: 'remote.optimistic.overlays, remote.placed]',
        replace: 'remote.optimistic.overlays]',
      },
    ],
    tests,
  },
  {
    name: 'meta says a list stale only for its check is stale',
    edits: [
      {
        file: '../src/domain.ts',
        find: 'if (readsStale(remote, connection.identity)) stale = true',
        replace: 'if (remote.connections[connection.identity]?.stale === true) stale = true',
      },
    ],
    tests,
  },
  {
    name: 'meta says a list fetched only for its check is loading',
    edits: [
      {
        file: '../src/domain.ts',
        find: 'remote.placed[connection.identity]?.checking !== true &&',
        replace: 'true &&',
      },
    ],
    tests,
  },
]
