/**
 * The Builder speaks through the announcer's helper (#495), not by sending
 * the announcer's Message: `pnpm mutate packages/builder/test/announce.mutations.ts`.
 */
const builder = '../src/index.ts'
const tests = ['packages/builder/test/builder.test.ts']

export default [
  {
    name: 'a copy that reached the clipboard says nothing',
    edits: [
      {
        file: builder,
        find: 'return announced(model, message.said)',
        replace: 'return { model }',
      },
    ],
    tests,
  },
  {
    name: 'a refusal is said politely',
    edits: [
      {
        file: builder,
        find: "refusal.message, 'assertive')",
        replace: 'refusal.message)',
      },
    ],
    tests,
  },
  {
    name: 'an undo is said as nothing',
    edits: [
      {
        file: builder,
        find: 'Match.valueTags(message, { Undid: () => words.undone, Redid: () => words.redone }),',
        replace: "'',",
      },
    ],
    tests,
  },
]
