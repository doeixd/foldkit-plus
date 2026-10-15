/**
 * The context menu, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/contextMenu.mutations.ts` checks that
 * a test fails for every one.
 */
const file = '../src/contextMenu.ts'
const browser = 'packages/mixins-ui/test/contextMenu.browser.test.ts'

export default [
  {
    name: 'a left press records the point, not a right one',
    edits: [{ file, find: 'button === 2 ?', replace: 'button === 0 ?' }],
    tests: [browser],
  },
  {
    name: "a press's axes are swapped",
    edits: [
      {
        file,
        find: 'options.onPoint({ x: clientX, y: clientY })',
        replace: 'options.onPoint({ x: clientY, y: clientX })',
      },
    ],
    tests: [browser],
  },
  {
    name: 'the contextmenu event opens nothing',
    edits: [{ file, find: '  h.OnContextMenu(options.onOpen),\n', replace: '' }],
    tests: [browser],
  },
  {
    name: 'the mark stays where the button is drawn',
    edits: [
      {
        file,
        find: "({ position: 'fixed', left: `${x}px`, top: `${y}px` })",
        replace: '({ left: `${x}px`, top: `${y}px` })',
      },
    ],
    tests: [browser],
  },
  {
    name: "the mark keeps the Menu button's ladder height",
    edits: [{ file, find: "  minBlockSize: '0',\n", replace: '' }],
    tests: [browser],
  },
]
