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
    name: 'a card that does not link its packages',
    edits: [
      {
        file: '../src/main.ts',
        find: '      demo.packages.map(name =>',
        replace: '      [].map((name: string) =>',
      },
    ],
    tests,
  },
  {
    name: 'a card without its steps',
    edits: [
      {
        file: '../src/main.ts',
        find: '      demo.tryThis.map(step =>',
        replace: '      [].map((step: string) =>',
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
