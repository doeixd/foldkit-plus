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
        find: 'model.edited || form.authoredChanged(model.form, next.model)',
        replace: "model.edited || Predicate.isTagged(message, 'Changed')",
      },
      {
        file: editor,
        find: "import { Effect, Match, Option, Schema } from 'effect'",
        replace: "import { Effect, Match, Option, Predicate, Schema } from 'effect'",
      },
    ],
    tests,
  },
  {
    name: 'every message starts a new round',
    edits: [
      {
        file: editor,
        find: 'model.edited || form.authoredChanged(model.form, next.model)',
        replace: 'true',
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
        find: 'if (named.length === 0) return root',
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
        find: 'return draftKeys.has(refusal.key)\n          ? [{ key: refusal.key, error: String(refusal.reason) }]\n          : []',
        replace: 'return [{ key: refusal.key, error: String(refusal.reason) }]',
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
  {
    name: 'nothing is ever locked',
    edits: [
      {
        file: editor,
        find: '(locks.locked(row, member) ? [key] : [])',
        replace: '[]',
      },
    ],
    tests,
  },
  {
    name: 'a relation key is never locked',
    edits: [
      { file: editor, find: '[key as keyof Fields & string, relation.key] as const,', replace: '' },
    ],
    tests,
  },
  {
    name: 'what locks read is not loaded',
    edits: [{ file: editor, find: '...locks.select,', replace: '' }],
    tests,
  },
  {
    name: 'a failed refresh forgets the last value known good',
    edits: [
      {
        file: editor,
        find: 'Failed: (_, previous) => previous,',
        replace: 'Failed: () => Option.none(),',
      },
    ],
    tests,
  },
]
