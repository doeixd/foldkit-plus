/**
 * The window list island, broken in turn:
 * `pnpm mutate examples/widgets/test/window-list.mutations.ts`.
 */
const tests = ['examples/widgets/test/window-list.test.ts']

export default [
  {
    name: 'an unchanged list makes a new Model',
    edits: [
      {
        file: '../src/window-list/app.ts',
        find: 'next === model.list ? model : ',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'two names are the same',
    edits: [
      {
        file: '../src/window-list/app.ts',
        find: 'Math.floor(index / WORDS.length) + 1',
        replace: 'Math.floor(index / (WORDS.length * 2)) + 1',
      },
    ],
    tests,
  },
]
