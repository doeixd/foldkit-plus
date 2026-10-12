/**
 * The site on its Site tree, broken in turn:
 * `pnpm mutate examples/cms/test/siteHead.mutations.ts` checks that a test
 * fails for every one.
 */
const app = '../src/apps/siteApp.ts'
const head = ['examples/cms/test/siteHead.test.ts']
const paths = ['examples/cms/test/sitePath.test.ts']
const built = ['examples/cms/test/prerender.test.ts']
const links = ['examples/cms/test/siteLinks.test.ts']
const focus = ['examples/cms/test/siteFocus.test.ts']

export default [
  {
    name: 'pointing at a link reads nothing ahead',
    edits: [
      {
        file: app,
        find: ': { model, commands: [Data.preload({ ...model, route }, actives)] },',
        replace: ': { model },',
      },
    ],
    tests: head,
  },
  {
    name: 'a link to another application is read ahead too',
    edits: [
      {
        file: app,
        find: '      Option.match(Site.routeAt(SiteMap, url), {\n        onNone: () => ({ model }),',
        replace:
          '      Option.match(Option.some(routeOf(url)), {\n        onNone: () => ({ model }),',
      },
    ],
    tests: head,
  },
  {
    name: 'the page the reader is on is read ahead again',
    edits: [
      {
        file: app,
        find: '          Equal.equals(route, model.route)\n            ? { model }',
        replace: '          false\n            ? { model }',
      },
    ],
    tests: head,
  },
  {
    name: 'the blog says nothing of itself',
    edits: [
      {
        file: app,
        find: "  title: 'The blog',\n  description: BLOG_LEDE,\n",
        replace: '',
      },
    ],
    tests: head,
  },
  {
    name: 'every page loses the site’s name and image',
    edits: [{ file: app, find: "    siteName: 'Journal',\n    image: IMAGE,\n", replace: '' }],
    tests: head,
  },
  {
    name: 'a slug is not encoded in its address',
    edits: [
      {
        file: '../src/content/siteRoutes.ts',
        find: 'encode: SchemaGetter.transform((text: string) => encodeURIComponent(text)),',
        replace: 'encode: SchemaGetter.transform((text: string) => text),',
      },
    ],
    tests: paths,
  },
  {
    name: 'the page node takes the blog’s address first',
    edits: [
      {
        file: app,
        find: 'Site.mount(HomeNode, [Site.mount(BlogNode, [PostNode]), PageNode])',
        replace: 'Site.mount(HomeNode, [PageNode, Site.mount(BlogNode, [PostNode])])',
      },
    ],
    tests: paths,
  },
  {
    name: 'the home page is built at its slug as well',
    edits: [
      {
        file: '../src/ssr/prerender.ts',
        find: "rows.filter(page => page.slug !== 'home')",
        replace: 'rows',
      },
    ],
    tests: built,
  },
  {
    name: 'a page loses its sitemap date',
    edits: [
      {
        file: '../src/ssr/prerender.ts',
        find: 'modified: modified ?? newest',
        replace: "modified: modified ?? ''",
      },
    ],
    tests: built,
  },
  {
    name: 'another post replaces the one shown',
    edits: [
      {
        file: app,
        find: "  .meta<Model>(({ route, model }) => postMeta(route, model))\n  .history((prev, next) => (prev.slug === next.slug ? 'replace' : 'push')).node",
        replace: '  .meta<Model>(({ route, model }) => postMeta(route, model)).node',
      },
    ],
    tests: links,
  },
  {
    name: 'a new route leaves focus where it was',
    edits: [
      { file: app, find: '  arrived: model => ({', replace: '  _arrived: (model: Model) => ({' },
    ],
    tests: focus,
  },
  {
    name: 'links are not the site tree’s to route',
    edits: [
      {
        file: app,
        find: 'Parent.assemble(Data.wiring(actives), Routing)',
        replace: 'Parent.assemble(Data.wiring(actives))',
      },
    ],
    tests: [...links, ...focus],
  },
]
