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
  {
    name: 'a refused key is not shown on the form',
    edits: [
      {
        file: editor,
        find: 'if (Option.isNone(field) || !draftKeys.has(field.value.key)) return root',
        replace: 'return root',
      },
    ],
    tests,
  },
  {
    name: 'a refusal is shown again after every Message',
    edits: [
      {
        file: editor,
        find: 'if (requestId === null || Option.contains(editor.refusedFor, requestId)) return root',
        replace: 'if (requestId === null) return root',
      },
    ],
    tests,
  },
  {
    name: 'a refusal of a key the form lacks is sent to the form',
    edits: [
      {
        file: editor,
        find: 'if (Option.isNone(field) || !draftKeys.has(field.value.key)) return root',
        replace: 'if (Option.isNone(field)) return root',
      },
    ],
    tests,
  },
  {
    name: 'a conflict reads as a failed save',
    edits: [
      {
        file: editor,
        find: 'Option.exists(refusalOf(root), Refusal.isConflict)',
        replace: 'false',
      },
    ],
    tests,
  },
]
