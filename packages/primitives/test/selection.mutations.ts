const tests = ['packages/primitives/test/selection.test.ts']

export default [
  {
    name: 'a single selection accepts multiple distinct ids',
    edits: [
      {
        file: '../src/interaction/selection.ts',
        find: "if (args.mode === 'single' && selected.length > 1) {",
        replace: "if (args.mode === 'single' && selected.length > 2) {",
      },
    ],
    tests,
  },
]
