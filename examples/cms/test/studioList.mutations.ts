/**
 * The worklist after a first save, broken in turn:
 * `pnpm mutate examples/cms/test/studioList.mutations.ts`.
 */
const tests = ['examples/cms/test/studioList.test.ts']

export default [
  {
    name: 'an entry’s creation declares no collation, so it cannot be placed',
    edits: [
      {
        file: '../../../packages/cms/src/index.ts',
        find: 'Collation.of(Collation.binary),',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a placement is worked out and not kept',
    edits: [
      {
        file: '../../../packages/remote/src/index.ts',
        find: 'else if (pages !== original) placed[identity] = pages',
        replace: '',
      },
    ],
    tests,
  },
]
