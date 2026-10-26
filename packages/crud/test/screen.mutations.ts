/**
 * `Crud.screen`, broken in turn: `pnpm mutate packages/crud/test/screen.mutations.ts`.
 */
const file = '../src/screen.ts'
const tests = ['packages/crud/test/screen.test.ts']

export default [
  {
    name: 'closing starts a new one instead',
    edits: [
      {
        file,
        find: 'if (isClosed(received)) return pieces.editing.helpers.close()(root)',
        replace: 'if (isClosed(received)) return pieces.editing.helpers.blank()(root)',
      },
    ],
    tests,
  },
  {
    name: 'a new one opens nothing',
    edits: [
      {
        file,
        find: 'if (isCreated(received)) return pieces.editing.helpers.blank()(root)',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'the editor is not synced after a Message',
    edits: [{ file, find: 'pieces.editor.after((root: Root', replace: '((root: Root' }],
    tests,
  },
  {
    name: 'a delete is never asked',
    edits: [{ file, find: 'isAsked(received) && pieces.removing !== undefined', replace: 'false' }],
    tests,
  },
  {
    name: 'a delete is asked of a remover the page does not have',
    edits: [
      {
        file,
        find: 'isAsked(received) && pieces.removing !== undefined',
        replace: 'isAsked(received)',
      },
    ],
    tests,
  },
  {
    name: 'the closing Message is misnamed',
    edits: [{ file, find: '[`Closed${name}`]: {},', replace: '[`Close${name}`]: {},' }],
    tests,
  },
  {
    name: 'a no leaves focus on the page',
    edits: [
      {
        file: '../src/index.ts',
        find: 'return { model: idle, commands: [FocusAsker({ selector })] }',
        replace: 'return { model: idle }',
      },
    ],
    tests: ['examples/entity/test/page.test.ts'],
  },
  {
    name: 'a no to no question moves focus',
    edits: [
      {
        file: '../src/index.ts',
        find: 'if (model.target === null || returnFocus === undefined) return { model: idle }',
        replace: 'if (returnFocus === undefined) return { model: idle }',
      },
    ],
    tests: ['packages/crud/test/remover.test.ts'],
  },
  {
    name: 'focus ignores the id asked about',
    edits: [
      {
        file: '../src/index.ts',
        find: "typeof returnFocus === 'string' ? returnFocus : returnFocus(model.target)",
        replace: "typeof returnFocus === 'string' ? returnFocus : '#delete'",
      },
    ],
    tests: ['packages/crud/test/remover.test.ts'],
  },
]
