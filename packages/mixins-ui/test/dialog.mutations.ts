/**
 * The Dialog and its alert role, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/dialog.mutations.ts`.
 */
const unit = 'packages/mixins-ui/test/dialog.test.ts'
const browser = 'packages/mixins-ui/test/dialog.browser.test.ts'
const panel = 'packages/mixins-ui/test/dialogPanel.browser.test.ts'

export default [
  {
    name: 'a dismissal is not told apart',
    edits: [
      {
        file: '../src/dialog.ts',
        find: "message._tag === 'RequestedClose'",
        replace: 'message._tag === message._tag && false',
      },
    ],
    tests: [browser],
  },
  {
    name: 'an alert dialog draws no role',
    edits: [
      {
        file: '../src/dialog.ts',
        find: "[...render.dialog, h.Role('alertdialog')]",
        replace: 'render.dialog',
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'every dialog is an alert dialog',
    edits: [
      {
        file: '../src/dialog.ts',
        find: "context.role === 'alertdialog'",
        replace: 'true',
      },
    ],
    tests: [unit],
  },
  {
    name: 'the padding adds to the panel’s width',
    edits: [
      { file: '../src/recipes/dialog.ts', find: "        boxSizing: 'border-box',\n", replace: '' },
    ],
    tests: [panel],
  },
  {
    name: 'a long panel runs past the viewport',
    edits: [
      {
        file: '../src/recipes/dialog.ts',
        find: '        maxBlockSize: `calc(${room.block})`,\n',
        replace: '',
      },
    ],
    tests: [panel],
  },
  {
    name: 'the body grows with what it holds, and the panel scrolls instead',
    edits: [
      {
        file: '../src/recipes/dialog.ts',
        find: "        flex: '1 1 auto',\n        minBlockSize: '0',\n",
        replace: "        flex: '1 1 auto',\n",
      },
    ],
    tests: [panel],
  },
  {
    name: 'a full panel keeps its content’s height',
    edits: [
      {
        file: '../src/recipes/dialog.ts',
        find: ', blockSize: `calc(${room.block})` }',
        replace: ' }',
      },
    ],
    tests: [panel],
  },
  {
    name: 'a covered panel is not marked',
    edits: [
      {
        file: '../src/dialog.ts',
        find: "h.DataAttribute('covered', '')",
        replace: "h.DataAttribute('open-under', '')",
      },
    ],
    tests: [panel],
  },
]
