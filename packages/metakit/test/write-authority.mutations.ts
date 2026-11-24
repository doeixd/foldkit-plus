export default [
  {
    name: 'a dynamic transition write accepts an input path',
    edits: [
      {
        file: '../src/transition.ts',
        find: "if (target.segments[0] !== 'state') {",
        replace: 'if (false) {',
      },
    ],
    tests: ['packages/metakit/test/write-authority.test.ts'],
  },
]
