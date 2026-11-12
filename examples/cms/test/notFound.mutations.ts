/**
 * The 404 page, broken in turn:
 * `pnpm mutate examples/cms/test/notFound.mutations.ts` checks that a test
 * fails for every one.
 */
const build = '../src/ssr/siteBuild.ts'
const render = '../src/ssr/prerender.ts'
const tests = ['examples/cms/test/notFound.test.ts']

export default [
  {
    name: 'no 404 page is emitted',
    edits: [
      {
        file: build,
        find: "emit: async () => [{ file: '404.html', contents: await renderNotFound(await prepared(), shell) }],",
        replace: 'emit: async () => [],',
      },
    ],
    tests,
  },
  {
    name: 'the title forgets it is missing',
    edits: [
      {
        file: render,
        find: '<title>Not found · Journal</title>',
        replace: '<title>Journal</title>',
      },
    ],
    tests,
  },
  {
    name: 'the page is indexable',
    edits: [{ file: render, find: '\\n    <meta name="robots" content="noindex" />', replace: '' }],
    tests,
  },
  {
    name: 'the page is drawn from a path that has a home link elsewhere',
    edits: [{ file: render, find: "'/site/not-found'", replace: "'/site/blog/not-found'" }],
    tests,
  },
  {
    name: 'the missing address is listed as a page of the site',
    edits: [
      {
        file: build,
        find: 'paths: async () => (await prepared()).paths(),',
        replace:
          "paths: async () => [...(await (await prepared()).paths()), { path: '/site/not-found' }],",
      },
    ],
    tests,
  },
  {
    name: 'the takeover envelope stays',
    edits: [
      {
        file: render,
        find: "    (h: string) => stripped(h, /\\s+data-foldkit-plus-resume='[^']*'/),\n",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'the client script stays',
    edits: [
      {
        file: render,
        find: '    (h: string) => stripped(h, /\\s*<script\\b[^>]*><\\/script>/g),\n',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'the canonical link to the missing address stays',
    edits: [
      {
        file: render,
        find: '    (h: string) => stripped(h, /\\s*<link rel="canonical"[^>]*>/),\n',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'the sandbox preloads stay',
    edits: [
      {
        file: render,
        find: '.replace(/\\s*<link rel="(?:module)?preload"[^>]*>/g, \'\')',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'the page loses the site’s styles',
    edits: [
      {
        file: render,
        find: "head: rendered => stylesOf(rendered.html),\n      files: 'flat',\n    }),\n  )\n  const [page]",
        replace: "files: 'flat',\n    }),\n  )\n  const [page]",
      },
    ],
    tests,
  },
]
