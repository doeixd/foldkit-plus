/**
 * The narrow window's compact formatting bar, broken in turn: `pnpm mutate
 * examples/pages/test/narrow.mutations.ts`. That the window is read before the first drawing
 * (`browser.ts`) is the e2e's to show: its dev server is outside `pnpm mutate`.
 */
const tests = ['examples/pages/test/pages.test.ts']

export default [
  {
    name: 'the bar is never compact',
    edits: [{ file: '../src/view.ts', find: 'compact: model.narrow,', replace: 'compact: false,' }],
    tests,
  },
  {
    name: 'no mark gives way on a narrow window',
    edits: [
      {
        file: '../src/view.ts',
        find: 'LOW_MARKS.includes(mark) ? { low: { mark } } : { mark }',
        replace: '{ mark }',
      },
    ],
    tests,
  },
  {
    name: 'the Model starts wide whatever the window was',
    edits: [{ file: '../src/app.ts', find: '  narrow,\n', replace: '  narrow: false,\n' }],
    tests,
  },
  {
    name: 'a width that did not change is a new Model, so it renders',
    edits: [
      {
        file: '../src/app.ts',
        find: 'narrow === model.narrow',
        replace: 'false',
      },
    ],
    tests,
  },
  {
    name: 'a change of width is not taken',
    edits: [
      {
        file: '../src/app.ts',
        find: '{ model: modifyFields(model, { narrow: () => narrow }) }',
        replace: '{ model }',
      },
    ],
    tests,
  },
]
