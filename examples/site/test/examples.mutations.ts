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
        file: '../src/gallery/previews/avatar.ts',
        find: "{ name: 'picture', example: picture }",
        replace: "{ name: 'pictures', example: picture }",
      },
    ],
    tests,
  },
  {
    name: 'an example names no region',
    edits: [
      {
        file: '../src/gallery/previews/checkbox.ts',
        find: "name: 'basic',\n      title: 'Basic',",
        replace: "name: 'basics',\n      title: 'Basic',",
      },
    ],
    tests,
  },
  {
    name: 'a region is renamed away from its example',
    edits: [
      {
        file: '../src/snippets/components.ts',
        find: '// #region checkbox-basic',
        replace: '// #region checkbox-basics',
      },
    ],
    tests,
  },
]
