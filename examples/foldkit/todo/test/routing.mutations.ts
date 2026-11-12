/**
 * The filter in the URL beside the stored list, broken one seam at a time:
 * `pnpm mutate examples/foldkit/todo/test/routing.mutations.ts`.
 */
const main = '../src/main.ts'
const tests = [
  'examples/foldkit/todo/test/routing.test.ts',
  'examples/foldkit/todo/test/runtime.test.ts',
]

export default [
  {
    name: 'routing reads no mirror',
    edits: [{ file: main, find: 'mirrors: [FilterMirror],', replace: 'mirrors: [] as never,' }],
    tests,
  },
  {
    name: 'init drops the stored list',
    edits: [
      {
        file: main,
        find: 'model: Mirror.bootstrap(initialModel, TodosMirror.bootstrap(flags.todos)),',
        replace: 'model: initialModel,',
      },
    ],
    tests,
  },
  {
    name: 'a filter replaces the history entry',
    edits: [
      {
        file: main,
        find: "keys: { filter: { history: 'push' } },",
        replace: "keys: { filter: { history: 'replace' } },",
      },
    ],
    tests,
  },
  {
    name: 'the filter is never written to the URL',
    edits: [{ file: main, find: '    ...FilterMirror.subscriptions,\n', replace: '' }],
    tests,
  },
  {
    name: 'a URL echo copies the Model',
    edits: [
      {
        file: main,
        find: 'ChangedUrl: () => ({ model }),',
        replace: 'ChangedUrl: () => ({ model: { ...model } }),',
      },
    ],
    tests,
  },
]
