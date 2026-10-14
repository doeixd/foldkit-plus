/**
 * InsertBlock and DeleteBlock, each step broken in turn: `pnpm mutate
 * packages/richtext/test/insertDelete.mutations.ts` checks that a test fails for every one.
 */
const file = '../src/command.ts'
const tests = ['packages/richtext/test/insertDelete.test.ts']

export default [
  {
    name: 'an insert lands before the block it was to follow',
    edits: [
      {
        file,
        find: "beside.path[beside.path.length - 1]! + ('after' in to ? 1 : 0)",
        replace: 'beside.path[beside.path.length - 1]!',
      },
    ],
    tests,
  },
  {
    name: 'an insert keeps the identities it was given',
    edits: [
      {
        file,
        find: 'const [inserted] = withFreshIds({ version: 1, blocks: [command.block] }, ids.mint).blocks',
        replace: 'const inserted = command.block',
      },
    ],
    tests,
  },
  {
    name: 'an insert skips its container’s constraint',
    edits: [
      {
        file,
        find: '!acceptsChild(state.document, containerPath, kind, options.nodes)) ||',
        replace: 'false) ||',
      },
    ],
    tests,
  },
  {
    name: 'an insert leaves the caret behind',
    edits: [
      { file, find: 'const first = firstRunIn([inserted!])', replace: 'const first = undefined' },
    ],
    tests,
  },
  {
    name: 'an insert at the caret always goes after its block',
    edits: [
      {
        file,
        find: 'return empty ? { before: block.id } : { after: block.id }',
        replace: 'return { after: block.id }',
      },
    ],
    tests,
  },
  {
    name: 'a delete leaves the container it empties',
    edits: [
      {
        file,
        find: 'emptiedBy(state.document, deleting.path.slice(0, -1), [-1]) ?? command.node',
        replace: 'command.node',
      },
    ],
    tests,
  },
  {
    name: 'a caret in a deleted block stays where it was',
    edits: [
      {
        file,
        find: '...(holds ? [Edit.setSelection(landing === undefined ? null : caretAt(landing))] : []),',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a caret in the last text has nowhere after to go to, and clears',
    edits: [{ file, find: ': preceding !== undefined', replace: ': false' }],
    tests,
  },
  {
    name: 'a document can be emptied',
    edits: [
      {
        file,
        find: 'const emptiesDocument = gone.path.length === 1 && state.document.children.length === 1',
        replace: 'const emptiesDocument = false',
      },
    ],
    tests,
  },
]
