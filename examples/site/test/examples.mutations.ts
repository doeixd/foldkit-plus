/**
 * A showcase's examples, broken in turn:
 * `pnpm mutate examples/site/test/examples.mutations.ts` checks that a test
 * fails for every one.
 */
const tests = ['examples/site/test/examples.test.ts']

export default [
  {
    name: 'two examples share a name',
    edits: [
      {
        file: '../src/gallery/showcases.ts',
        find: "        name: 'banner',",
        replace: "        name: 'inline',",
      },
    ],
    tests,
  },
  {
    name: 'an example names no region',
    edits: [
      {
        file: '../src/gallery/showcases.ts',
        find: "{ name: 'dot',",
        replace: "{ name: 'dotted',",
      },
    ],
    tests,
  },
  {
    name: 'a region is renamed away from its example',
    edits: [
      {
        file: '../src/snippets/components.ts',
        find: '// #region alert-inline',
        replace: '// #region alert-inlines',
      },
    ],
    tests,
  },
]
