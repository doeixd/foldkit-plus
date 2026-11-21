/** A placement kept on `writes.epochFor`: `pnpm mutate packages/plus/test/writesPlacement.mutations.ts` */
const tests = ['packages/plus/test/writesPlacement.test.ts']

export default [
  {
    name: 'epochFor ignores a Model track did not make',
    edits: [
      {
        file: '../../surface/src/writes.ts',
        find: '      return root => {\n        adopt(root)\n',
        replace: '      return _root => {\n',
      },
    ],
    tests,
  },
  {
    name: 'a placement hands its pathEpoch no parent',
    edits: [
      {
        file: '../../bundle/src/placed.ts',
        find: '{ pathEpoch: () => pathEpoch(drawnParent) }',
        replace: '{ pathEpoch: () => pathEpoch(undefined) }',
      },
    ],
    tests,
  },
]
