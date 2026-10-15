/**
 * The scroll divider, broken in turn:
 * `pnpm mutate packages/mixins/test/scrollDivider.mutations.ts`.
 */
const tests = ['packages/mixins/test/scrollDivider.browser.test.ts']
const file = '../src/utilities.ts'

export default [
  {
    name: 'the start line shows at the top',
    edits: [
      {
        file,
        find: "const showLine = keyframes({ from: { opacity: '0' }, to: { opacity: '1' } })",
        replace: "const showLine = keyframes({ from: { opacity: '1' }, to: { opacity: '1' } })",
      },
    ],
    tests,
  },
  {
    name: 'the end line stays at the end',
    edits: [
      {
        file,
        find: "const hideLine = keyframes({ from: { opacity: '1' }, to: { opacity: '0' } })",
        replace: "const hideLine = keyframes({ from: { opacity: '1' }, to: { opacity: '1' } })",
      },
    ],
    tests,
  },
  {
    name: 'the parent cannot borrow the timeline',
    edits: [{ file, find: 'self({ timelineScope: name }),', replace: 'self({}),' }],
    tests,
  },
  {
    name: 'the lines show over content with nothing to scroll',
    edits: [
      {
        file,
        find: "const drawn = { content: '\"\"', position: 'absolute', opacity: '0', pointerEvents: 'none' }",
        replace:
          "const drawn = { content: '\"\"', position: 'absolute', opacity: '1', pointerEvents: 'none' }",
      },
    ],
    tests,
  },
]
