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
        find: ': [FocusAsker({ selector: options.returnFocus })],',
        replace: ': [],',
      },
    ],
    tests: ['examples/entity/test/page.test.ts'],
  },
]
