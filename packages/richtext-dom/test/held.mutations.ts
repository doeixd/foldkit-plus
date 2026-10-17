/**
 * Input held behind an unanswered edit, each part broken in turn: `pnpm mutate
 * packages/richtext-dom/test/held.mutations.ts` checks that a test fails for every one.
 */
const file = '../src/events.ts'
const tests = ['packages/richtext-dom/test/held.browser.test.ts']

export default [
  {
    name: 'a caret key is never held',
    edits: [
      {
        file,
        find: "if (unanswered > 0 && event.type === 'keydown' && !composing) {",
        replace: 'if (false) {',
      },
    ],
    tests,
  },
  {
    name: 'a caret key is held with no edit unanswered',
    edits: [
      {
        file,
        find: "if (unanswered > 0 && event.type === 'keydown' && !composing) {",
        replace: "if (event.type === 'keydown' && !composing) {",
      },
    ],
    tests,
  },
  {
    name: 'an edit behind a held key goes at once',
    edits: [
      { file, find: 'if (held.length === 0) return ask(command)', replace: 'return ask(command)' },
    ],
    tests,
  },
  {
    name: 'an answer lets nothing go',
    edits: [{ file, find: '    if (unanswered > 0) return\n', replace: '    return\n' }],
    tests,
  },
  {
    name: 'a held move is not made',
    edits: [
      {
        file,
        find: "      live.modify(move.extend ? 'extend' : 'move', move.direction, move.granularity)\n",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'an edit nothing answers holds its keys for good',
    edits: [{ file, find: '}, UNANSWERED_MS)', replace: '}, 60_000)' }],
    tests,
  },
  {
    name: 'an edit is not answered',
    edits: [
      {
        file: '../src/editor-bundle.ts',
        find: "const answering = message._tag === 'Selected' ? [] : [answer(model.hostId)]",
        replace: 'const answering: Array<never> = []',
      },
    ],
    tests: ['packages/richtext-dom/test/editor-bundle.test.ts'],
  },
]
