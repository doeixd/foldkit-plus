/**
 * The outline, each part broken in turn: `pnpm mutate packages/richtext/test/outline.mutations.ts`
 * checks that a test fails for every one.
 */
const file = '../src/outline.ts'
const tests = ['packages/richtext/test/outline.test.ts']

export default [
  {
    name: 'a blank heading is listed',
    edits: [
      {
        file,
        find: "if (text.trim() !== '') entries.push",
        replace: 'entries.push',
      },
    ],
    tests,
  },
  {
    name: 'a blank heading starts a section',
    edits: [
      {
        file,
        find: "block.type === 'Heading' && block.children.some(run => run.text.trim() !== '')",
        replace: "block.type === 'Heading'",
      },
    ],
    tests,
  },
  {
    name: 'the caret’s own heading is not its section',
    edits: [
      {
        file,
        find: `    if (block.type === 'Heading' && block.children.some(run => run.text.trim() !== '')) {
      last = block.id
    }
    if (block.children.some(run => run.id === start.node)) {
      found = last
    }`,
        replace: `    if (block.children.some(run => run.id === start.node)) {
      found = last
    }
    if (block.type === 'Heading' && block.children.some(run => run.text.trim() !== '')) {
      last = block.id
    }`,
      },
    ],
    tests,
  },
]
