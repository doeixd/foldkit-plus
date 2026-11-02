/**
 * The server prices and draws the first screen's groups, and no more:
 * `pnpm mutate examples/foldkit/domains-plus/test/firstScreen.mutations.ts`.
 */
const tests = [
  'examples/foldkit/domains-plus/test/page.test.ts',
  'examples/foldkit/domains-plus/test/results.test.ts',
]
const list = '../src/client/resultsList.ts'

export default [
  {
    name: 'the list assumes the default viewport before it is placed',
    edits: [
      {
        file: list,
        find: '    viewportHeight: RESULTS_FIRST_SCREEN_GROUPS * RESULTS_GROUP_HEIGHT_PX,\n',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'the overscan is not read with the first screen',
    edits: [
      { file: list, find: 'RESULTS_OVERSCAN_GROUPS = 2', replace: 'RESULTS_OVERSCAN_GROUPS = 0' },
    ],
    tests,
  },
]
