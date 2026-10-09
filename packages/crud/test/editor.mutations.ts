/**
 * The editor, broken in turn: `pnpm mutate packages/crud/test/editor.mutations.ts`
 * checks that a test fails for every one.
 */
const tests = ['packages/crud/test/editor.test.ts']
const editor = '../src/index.ts'

export default [
  {
    name: 'only a typed field starts a new round',
    edits: [
      {
        file: editor,
        find: 'form.authoredChanged(model.form, next.model) ? null : model.requestId',
        replace: "Predicate.isTagged(message, 'Changed') ? null : model.requestId",
      },
      {
        file: editor,
        find: "import { Option, Schema } from 'effect'",
        replace: "import { Option, Predicate, Schema } from 'effect'",
      },
    ],
    tests,
  },
  {
    name: 'every message starts a new round',
    edits: [
      {
        file: editor,
        find: 'form.authoredChanged(model.form, next.model) ? null : model.requestId',
        replace: 'null',
      },
    ],
    tests,
  },
  {
    name: 'a no-op copies the Model',
    edits: [{ file: editor, find: 'model: unchanged ? model :', replace: 'model:' }],
    tests,
  },
]
