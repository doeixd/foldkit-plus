/**
 * The formatting bar's fit on a touch phone, broken in turn: `pnpm mutate
 * examples/pages/test/formatBar.mutations.ts`.
 */
const tests = ['examples/pages/test/formatBar.touch.browser.test.ts']

export default [
  {
    name: 'undo and redo stay in the bar, which then wraps at 44px targets',
    edits: [
      {
        file: '../src/view.ts',
        find: "{ low: 'undo' },\n  { low: 'redo' },",
        replace: "'undo',\n  'redo',",
      },
    ],
    tests,
  },
  {
    name: 'the bar is never compact, so every control is drawn and wraps',
    edits: [{ file: '../src/view.ts', find: 'compact: model.narrow,', replace: 'compact: false,' }],
    tests,
  },
]
