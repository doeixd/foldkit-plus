/**
 * The studio's sections on their Site tree, broken in turn:
 * `pnpm mutate examples/cms/test/studioRoutes.mutations.ts` checks that a
 * test fails for every one.
 */
const routes = '../src/routing/studioRoutes.ts'
const tests = ['examples/cms/test/studioApp.test.ts', 'examples/cms/test/studioPreload.test.ts']

export default [
  {
    name: 'the pages address names the posts',
    edits: [
      {
        file: routes,
        find: "Pages: (): Section => 'pages'",
        replace: "Pages: (): Section => 'posts'",
      },
    ],
    tests,
  },
  {
    name: 'the pages section lives somewhere else',
    edits: [{ file: routes, find: "literal('pages')", replace: "literal('pagez')" }],
    tests,
  },
  {
    name: 'a section link forgets who is looking',
    edits: [
      {
        file: routes,
        find: '`${Site.hrefOf(StudioMap, sectionRoute(section))}?as=${chair}`',
        replace: 'Site.hrefOf(StudioMap, sectionRoute(section))',
      },
    ],
    tests,
  },
]
