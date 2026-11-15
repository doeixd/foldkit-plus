/**
 * LiveAnnounce's burst, blank text and two regions, broken in turn: `pnpm mutate
 * packages/primitives/test/live-announce.mutations.ts`.
 */
const file = '../src/interaction/live-announce.ts'
const tests = ['packages/primitives/test/live-announce.test.ts']

export default [
  {
    name: 'an announcement of the other politeness replaces the waiting one',
    edits: [
      {
        file,
        find: 'waiting !== null && waiting.politeness !== politeness',
        replace: 'false',
      },
    ],
    tests,
  },
  {
    name: 'every waiting announcement is read, even of the same politeness',
    edits: [
      {
        file,
        find: 'waiting !== null && waiting.politeness !== politeness',
        replace: 'waiting !== null',
      },
    ],
    tests,
  },
  {
    name: 'blank text starts a clock',
    edits: [
      {
        file,
        find: "if (text.trim() === '') return { model }",
        replace: 'if (text === undefined) return { model }',
      },
    ],
    tests,
  },
  {
    name: 'only an empty string, not blank space, is refused',
    edits: [{ file, find: "text.trim() === ''", replace: "text === ''" }],
    tests,
  },
  {
    name: 'the polite region loses its role',
    edits: [{ file, find: "h.Role('status'),", replace: '' }],
    tests,
  },
  {
    name: 'the assertive region loses its role',
    edits: [{ file, find: "h.Role('alert'),", replace: '' }],
    tests,
  },
]
