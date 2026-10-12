/**
 * The site on its Site tree, broken in turn:
 * `pnpm mutate examples/cms/test/siteHead.mutations.ts` checks that a test
 * fails for every one.
 */
const app = '../src/apps/siteApp.ts'
const head = ['examples/cms/test/siteHead.test.ts']
const paths = ['examples/cms/test/sitePath.test.ts']
const built = ['examples/cms/test/prerender.test.ts']

export default [
  {
    name: 'pointing at a link reads nothing ahead',
    edits: [
      {
        file: app,
        find: '      return { model, commands: [Data.preload({ ...model, route }, actives)] }',
        replace: '      return { model }',
      },
    ],
    tests: head,
  },
  {
    name: 'a link to another application is read ahead too',
    edits: [{ file: app, find: '      if (!onSite(url)) return { model }\n', replace: '' }],
    tests: head,
  },
  {
    name: 'the page the reader is on is read ahead again',
    edits: [
      {
        file: app,
        find: '      if (Equal.equals(route, model.route)) return { model }\n      return { model, commands',
        replace: '      return { model, commands',
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
]
