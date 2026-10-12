/**
 * The site, its content pipeline and its card data, broken in turn: `pnpm
 * mutate examples/site/test/site.mutations.ts` checks that a test fails for
 * every one.
 */
const tests = [
  'examples/site/test/demos.test.ts',
  'examples/site/test/guides.test.ts',
  'examples/site/test/prerender.test.ts',
]
export default [
  {
    name: 'a card the README does not list',
    edits: [
      {
        file: '../src/demos.ts',
        find: 'converging through one journal.',
        replace: 'converging.',
      },
    ],
    tests,
  },
  {
    name: 'a card that names a file that is not there',
    edits: [
      {
        file: '../src/demos.ts',
        find: "readFirst: 'examples/pages/src/app.ts'",
        replace: "readFirst: 'examples/pages/src/model.ts'",
      },
    ],
    tests,
  },
  {
    name: 'a row that does not link its packages',
    edits: [
      {
        file: '../src/view/home.ts',
        find: '...demo.packages.flatMap((name, index) => [',
        replace: '...[].flatMap((name: string, index: number) => [',
      },
    ],
    tests,
  },
  {
    name: 'a row whose source is not its file',
    edits: [
      {
        file: '../src/view/home.ts',
        find: 'h.Href(onGitHub(demo.readFirst))',
        replace: 'h.Href(onGitHub(demo.example))',
      },
    ],
    tests,
  },
  {
    name: 'every example shown at once',
    edits: [
      {
        file: '../src/view/home.ts',
        find: '...(model.example === example ? [] : [h.Hidden(true)]),',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a short section on a page of its own',
    edits: [
      {
        file: '../src/content/guides.ts',
        find: 'const SHORT_SECTION = 700',
        replace: 'const SHORT_SECTION = 0',
      },
    ],
    tests,
  },
  {
    name: "a link to a page's own title keeps an anchor nothing carries",
    edits: [
      {
        file: '../src/content/guides.ts',
        find: 'heading === section.heading ? section.path : `${section.path}#${id}`',
        replace: '`${section.path}#${id}`',
      },
    ],
    tests,
  },
  {
    name: 'a folder linked as a file',
    edits: [
      {
        file: '../src/content/guides.ts',
        find: "isDirectory() ? 'tree' : 'blob'",
        replace: "isDirectory() ? 'blob' : 'blob'",
      },
    ],
    tests,
  },
  {
    name: 'a sidebar that does not mark the page',
    edits: [
      {
        file: '../src/content/library.ts',
        find: "...(page === current ? [ih.AriaCurrent('page')] : [])",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'code drawn without colour',
    edits: [
      {
        file: '../src/content/highlight.ts',
        find: "light === undefined || dark === undefined ? '' : `light-dark(${light}, ${dark})`",
        replace: "''",
      },
    ],
    tests,
  },
  {
    name: 'a README without markers is written anyway',
    edits: [{ file: '../src/readme.ts', find: '  listIn(readme)\n', replace: '' }],
    tests,
  },
]
