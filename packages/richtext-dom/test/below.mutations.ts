/**
 * A press below the last block, each part broken in turn: `pnpm mutate
 * packages/richtext-dom/test/below.mutations.ts` checks that a test fails for every one.
 */
const file = '../src/events.ts'
const tests = ['packages/richtext-dom/test/below.test.ts']

export default [
  {
    name: 'a press below is left to the browser',
    edits: [
      { file, find: 'if (origin === current.root && pressBelow(event)) return', replace: '' },
    ],
    tests,
  },
  {
    name: 'a press beside the blocks counts as below',
    edits: [
      {
        file,
        find: 'if (event.clientY <= element.getBoundingClientRect().bottom) return false',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a last paragraph gets another after it',
    edits: [
      {
        file,
        find: "last.type === 'Paragraph' || last.type === 'Heading' ? last.children.at(-1) : undefined",
        replace: 'undefined',
      },
    ],
    tests,
  },
  {
    name: 'a last atom gets nothing after it',
    edits: [
      {
        file,
        find: "    options.onIntent({\n      type: 'InsertBlock',",
        replace: "    void ({\n      type: 'InsertBlock',",
      },
    ],
    tests,
  },
]
