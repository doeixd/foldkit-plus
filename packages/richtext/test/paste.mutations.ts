/**
 * Pasting a slice, each part broken in turn: `pnpm mutate packages/richtext/test/paste.mutations.ts`
 * checks that a test fails for every one.
 */
const file = '../src/command.ts'
const tests = ['packages/richtext/test/paste.test.ts']

export default [
  {
    name: 'the first piece stands apart from the text before the caret',
    edits: [
      {
        file,
        find: '    const joinsHead = joinable(block, first)',
        replace: '    const joinsHead = false',
      },
    ],
    tests,
  },
  {
    name: 'the last piece stands apart from the text after the caret',
    edits: [
      {
        file,
        find: '    const joinsTail = joinable(last, block)',
        replace: '    const joinsTail = false',
      },
    ],
    tests,
  },
  {
    name: 'a one-piece paste joins the text after it to the piece it already joined away',
    edits: [
      {
        file,
        find: 'joinsHead && last === first ? at.blockId : last.id',
        replace: 'last.id',
      },
    ],
    tests,
  },
  {
    name: 'an empty half before an image stays',
    edits: [
      {
        file,
        find: '    if (!joinsHead && beforeEmpty) operations.push(Edit.deleteBlock(at.blockId))\n',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'the empty line after an image goes too',
    edits: [
      {
        file,
        find: 'if (!joinsTail && afterEmpty && lastRun !== undefined)',
        replace: 'if (!joinsTail && afterEmpty)',
      },
    ],
    tests,
  },
  {
    name: 'a paste into code splits it into blocks',
    edits: [
      {
        file,
        find: "    if (holds?.kind === 'node' && holds.lineBreaks === true) {",
        replace: '    if (false) {',
      },
    ],
    tests,
  },
]
