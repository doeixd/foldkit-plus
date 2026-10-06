/**
 * The list kept while an entry opens, broken in turn:
 * `pnpm mutate examples/cms/test/keepsList.mutations.ts` checks that a test fails for every one.
 */
const file = '../src/views/shell.ts'
const tests = ['examples/cms/test/keepsList.test.ts']

export default [
  {
    name: 'the list is kept whatever the editor is doing',
    edits: [
      {
        file,
        find: "  status === 'Loading' &&\n  RemoteData.match",
        replace: '  RemoteData.match',
      },
    ],
    tests,
  },
  {
    name: 'the list is kept with nothing to show',
    edits: [
      {
        file,
        find: '    Initial: () => false,\n    Loading: () => false,\n    Ready',
        replace: '    Initial: () => true,\n    Loading: () => false,\n    Ready',
      },
    ],
    tests,
  },
  {
    name: 'a refreshing list is not kept',
    edits: [
      {
        file,
        find: '    Refreshing: () => true,\n    Failed: () => false,',
        replace: '    Refreshing: () => false,\n    Failed: () => false,',
      },
    ],
    tests,
  },
]
