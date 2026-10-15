/**
 * Typing at a mark's edge, each part broken in turn: `pnpm mutate
 * packages/richtext/test/edgeMarks.mutations.ts` checks that a test fails for every one.
 */
const marks = '../src/marks.ts'
const command = '../src/command.ts'
const tests = ['packages/richtext/test/edgeMarks.test.ts']

export default [
  {
    name: 'typing at a block’s edge extends every mark',
    edits: [
      {
        file: command,
        find: 'command.marks === undefined && isCollapsed(selection)',
        replace: 'false && isCollapsed(selection)',
      },
    ],
    tests,
  },
  {
    name: 'only the end of a block is an edge',
    edits: [
      {
        file: marks,
        find: 'const atStart = index === 0 && position.offset === 0',
        replace: 'const atStart = false',
      },
    ],
    tests,
  },
  {
    name: 'a mark already there must be declared',
    edits: [
      {
        file: command,
        find: "if (edge === undefined && !declared.accepts(mark)) return failure('InvalidInput')",
        replace: "if (!declared.accepts(mark)) return failure('InvalidInput')",
      },
    ],
    tests,
  },
  {
    name: 'nested blocks are not resolved',
    edits: [
      {
        file: marks,
        find: 'same rule.\n  eachBlock(document.children, block => {',
        replace:
          "same rule.\n  eachBlock(document.children.filter(block => block.type !== 'Node'), block => {",
      },
    ],
    tests,
  },
]
