/**
 * The header buttons' touch reach, broken in turn: `pnpm mutate
 * packages/mixins-data-grid/test/headerTouch.mutations.ts`.
 */
const file = '../src/style.ts'
const touch = ['packages/mixins-data-grid/test/headerTouch.touch.browser.test.ts']
const fine = ['packages/mixins-data-grid/test/headerTarget.browser.test.ts']

export default [
  {
    name: 'the reach across the row is not made',
    edits: [
      {
        file,
        find: "insetBlock: 'calc((1.5rem - var(--fk-touch-floor, 1.5rem)) / 2)',",
        replace: "insetBlock: '0',",
      },
    ],
    tests: touch,
  },
  {
    name: 'the funnel does not reach into the label',
    edits: [{ file, find: "touchTarget('-12px')", replace: "touchTarget('0')" }],
    tests: touch,
  },
  {
    name: 'a fine pointer gets the touch reach too',
    edits: [
      {
        file,
        find: "'@media (pointer: coarse)',\n    Style.nest('&::before', {\n      content: '\"\"',\n      position: 'absolute',\n      insetBlock: 'calc((1.5rem - var(--fk-touch-floor, 1.5rem)) / 2)',",
        replace:
          "'@media all',\n    Style.nest('&::before', {\n      content: '\"\"',\n      position: 'absolute',\n      insetBlock: '-8px',",
      },
    ],
    tests: fine,
  },
]
