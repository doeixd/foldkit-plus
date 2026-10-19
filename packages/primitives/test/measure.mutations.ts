/**
 * `Measure`'s moving mark, broken in turn:
 * `pnpm mutate packages/primitives/test/measure.mutations.ts` checks that a
 * test fails for every one.
 */
const tests = ['packages/primitives/test/measure.browser.test.ts']

export default [
  {
    name: 'a moved layout reads as a new mark',
    edits: [
      {
        file: '../src/dom/measure.ts',
        find: "previous === undefined || previous === target ? '0' : '1'",
        replace: "previous === undefined ? '0' : '1'",
      },
    ],
    tests,
  },
  {
    name: 'a new mark reads as a moved layout',
    edits: [
      {
        file: '../src/dom/measure.ts',
        find: "previous === undefined || previous === target ? '0' : '1'",
        replace: "'0'",
      },
    ],
    tests,
  },
]
