/**
 * What lets Scene draw the grid (#380), each broken in turn: its Mounts'
 * Messages when they start, and the header row's listener taking the resize
 * handles' drags. `pnpm mutate packages/mixins-data-grid/test/scene.mutations.ts`.
 */
const header = '../src/headerPress.ts'
const body = '../src/press.ts'
const view = '../src/view.ts'
const grid = '../../data-grid/src/grid.ts'
const viewport = '../../data-grid/src/viewport.ts'
const runtime = 'packages/mixins-data-grid/test/runtime.test.ts'
const drag = 'packages/mixins-data-grid/test/drag.test.ts'

export default [
  {
    name: 'the header row says nothing when it starts',
    edits: [{ file: header, find: '          offer(HeaderListening.make({}))\n', replace: '' }],
    tests: [runtime],
  },
  {
    name: 'the body says nothing when it starts',
    edits: [
      {
        file: body,
        find: '          Queue.offerUnsafe(queue, CellsListening.make({}))\n',
        replace: '',
      },
    ],
    tests: [runtime],
  },
  {
    name: 'a press on a resize handle drags its header',
    edits: [{ file: header, find: 'resize: handle !== null,', replace: 'resize: false,' }],
    tests: [drag],
  },
  {
    name: 'a resize never ends',
    edits: [
      {
        file: header,
        find: '              offer(HandleDragEnded.make({ completed }))\n',
        replace: '',
      },
    ],
    tests: [drag],
  },
  {
    name: 'resolveMounts answers the body with the measure',
    edits: [
      {
        file: view,
        find: '      [CellPress, listening],',
        replace: '      [CellPress, options.wrap(grid.Message.Measured(options.viewport))],',
      },
    ],
    tests: ['packages/mixins-data-grid/test/scene.test.ts'],
  },
  {
    name: 'the measure repeats a reading',
    edits: [{ file: viewport, find: '          if (key === last) return\n', replace: '' }],
    tests: ['packages/data-grid/test/viewport.test.ts'],
  },
  {
    name: 'a column that does not resize starts a resize',
    edits: [
      {
        file: grid,
        find: '              column => options.columns.byId[column].resizable !== false,',
        replace: '              () => true,',
      },
    ],
    tests: ['packages/data-grid/test/grid.test.ts'],
  },
]
