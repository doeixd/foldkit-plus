/**
 * `Attachment.redecorate`'s focus guard, broken in turn: `pnpm mutate
 * packages/richtext-dom/test/redecorate.mutations.ts`.
 */
const file = '../src/events.ts'
const tests = ['packages/richtext-dom/test/redecorate.browser.test.ts']

export default [
  {
    name: 'a decoration refresh pulls the focus into the text',
    edits: [
      {
        file,
        find: 'if (selection !== null && owned) restoreSelection',
        replace: 'if (selection !== null) restoreSelection',
      },
    ],
    tests,
  },
  {
    name: 'a decoration refresh never puts the selection back',
    edits: [
      {
        file,
        find: 'if (selection !== null && owned) restoreSelection',
        replace: 'if (selection !== null && !owned) restoreSelection',
      },
    ],
    tests,
  },
]
