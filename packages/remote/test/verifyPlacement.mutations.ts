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
    edits: [{ file: index, find: '      ...identities,', replace: '' }],
    tests,
  },
  {
    name: 'every placement is verified',
    edits: [
      {
        file: index,
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
        file: '../src/index.ts',
        find: 'return withPlacements(remote, placed, [])',
        replace: 'return { ...remote, connections: { ...remote.connections, ...placed } }',
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
        file: index,
        find: 'dropped: firstPage(remote.connections[identity]).filter(key => !kept.has(key)),',
        replace: 'dropped: [],',
      },
    ],
    tests,
  },
]
