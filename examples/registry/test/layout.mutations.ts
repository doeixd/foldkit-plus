/**
 * The registry page's fit to the screen, broken in turn: `pnpm mutate
 * examples/registry/test/layout.mutations.ts`.
 */
const tests = ['examples/registry/test/connection.browser.test.ts']

export default [
  {
    name: 'the grid has a height guessed from the screen, which the rows above it outgrow',
    edits: [
      {
        file: '../src/style.ts',
        find: "flex: '1 1 20rem',",
        replace: "height: 'calc(100dvh - 12rem)',",
      },
    ],
    tests,
  },
  {
    name: 'the page’s column is only as tall as its rows, so the grid stops short of the screen’s end',
    edits: [
      {
        file: '../src/style.ts',
        find: "Style.self({ minBlockSize: '100%' }),",
        replace: "Style.self({ minBlockSize: '0' }),",
      },
    ],
    tests,
  },
]
