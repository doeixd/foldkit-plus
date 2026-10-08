/**
 * The palette example, broken in turn:
 * `pnpm mutate examples/widgets/test/palette.mutations.ts` checks that a
 * test fails for every one.
 */
const tests = ['examples/widgets/test/palette.test.ts']

export default [
  {
    name: 'every pick runs, chosen or not',
    edits: [
      {
        file: '../src/palette/app.ts',
        find: 'if (model.open && picked !== null && picked !== before) {',
        replace: 'if (model.open && picked !== null) {',
      },
    ],
    tests,
  },
  {
    name: 'running leaves the palette open',
    edits: [
      {
        file: '../src/palette/app.ts',
        find: "return { model: { ...next, open: false, query: '', lastRan: label } }",
        replace: "return { model: { ...next, open: true, query: '', lastRan: label } }",
      },
    ],
    tests,
  },
  {
    name: 'the panel never claims the dialog',
    edits: [
      {
        file: '../src/palette/view.ts',
        find: "h.Role('dialog'),",
        replace: "h.Role('group'),",
      },
    ],
    tests,
  },
]
