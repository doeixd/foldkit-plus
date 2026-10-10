/**
 * `verifyPlacement`, broken in turn:
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
        find: 'if (options.verifyPlacement !== true) return invalidateConnections(withPlaced, invalidated)',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a placement always agrees',
    edits: [
      {
        file: model,
        find: 'const agrees = served.every((key, index) => key === asPlaced[index])',
        replace: 'const agrees = true',
      },
    ],
    tests,
  },
  {
    name: 'a compared order is kept',
    edits: [{ file: model, find: '    placed: rest,', replace: '    placed: model.placed,' }],
    tests,
  },
]
