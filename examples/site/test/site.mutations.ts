/**
 * The site and its card data, broken in turn: `pnpm mutate
 * examples/site/test/site.mutations.ts` checks that a test fails for every one.
 */
const tests = ['examples/site/test/demos.test.ts', 'examples/site/test/prerender.test.ts']
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
        file: '../src/main.ts',
        find: '        ...demo.packages.flatMap((name, index) => [',
        replace: '        ...[].flatMap((name: string, index: number) => [',
      },
    ],
    tests,
  },
  {
    name: 'a row whose source is not its file',
    edits: [
      {
        file: '../src/main.ts',
        find: "h.a(slots.source.attrs([h.Href(onGitHub(demo.readFirst))]), ['Source'])",
        replace: "h.a(slots.source.attrs([h.Href(onGitHub(demo.example))]), ['Source'])",
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
