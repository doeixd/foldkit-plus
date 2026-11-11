/**
 * The History's dates written in the runtime's locale or zone, each in turn:
 * `pnpm mutate packages/cms/test/history.mutations.ts`. The renders run in
 * child processes, which load the card through `mutation()`.
 */
const views = '../src/views.ts'
const tests = ['packages/cms/test/history.test.ts']

export default [
  {
    name: "the runtime's locale",
    edits: [
      { file: views, find: 'toLocaleDateString(locale,', replace: 'toLocaleDateString(undefined,' },
      { file: views, find: 'toLocaleTimeString(locale,', replace: 'toLocaleTimeString(undefined,' },
    ],
    tests,
  },
  {
    name: "the runtime's zone",
    edits: [
      {
        file: views,
        find: "      year: 'numeric',\n      timeZone,\n",
        replace: "      year: 'numeric',\n",
      },
      { file: views, find: "minute: '2-digit', timeZone }", replace: "minute: '2-digit' }" },
    ],
    tests,
  },
]
