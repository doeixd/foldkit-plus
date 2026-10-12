/**
 * The studio's read-ahead, broken in turn:
 * `pnpm mutate examples/cms/test/studioPreload.mutations.ts` checks that a
 * test fails for every one.
 */
const app = '../src/apps/studioApp.ts'
const tests = ['examples/cms/test/studioPreload.test.ts', 'examples/cms/test/studioApp.test.ts']

export default [
  {
    name: 'pointing at a link reads nothing ahead',
    edits: [
      {
        file: app,
        find: '            preloadAt(model, section, navigateSearch(model.query, url, section !== model.section)),\n',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a pages link reads the posts section ahead',
    edits: [
      {
        file: app,
        find: "  section === 'pages'\n    ? mapMessage(",
        replace: "  section !== 'pages'\n    ? mapMessage(",
      },
    ],
    tests,
  },
  {
    name: 'another chair is read ahead and followed in place',
    edits: [
      {
        file: app,
        find: '      ) === model.chair,\n',
        replace: '      ) === model.chair || true,\n',
      },
    ],
    tests,
  },
]
