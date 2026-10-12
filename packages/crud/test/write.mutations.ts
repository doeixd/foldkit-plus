/**
 * An editor over a declared write, broken in turn:
 * `pnpm mutate packages/crud/test/write.mutations.ts`.
 */
const tests = ['packages/crud/test/write.test.ts']
const file = '../src/index.ts'

/** The tests a save's settling shows in. */
const settling = ['packages/crud/test/write.test.ts', 'packages/crud/test/save.test.ts']

export default [
  {
    name: 'the changed keys are not sent',
    edits: [
      {
        file,
        find: ': { keys: changedKeys(slice.get(root), submitted.value) },',
        replace: ': undefined,',
      },
    ],
    tests,
  },
  {
    name: 'what the form was filled with is not kept',
    edits: [{ file, find: 'filledWith: Option.some(values),', replace: '' }],
    tests,
  },
  {
    name: 'every key counts as changed',
    edits: [
      {
        file,
        find: '!Object.hasOwn(filled, key) || !sameValue[key]!(filled[key], submitted[key]),',
        replace: 'true,',
      },
    ],
    tests,
  },
  {
    name: 'a key that was filled counts as unchanged whatever it holds',
    edits: [
      {
        file,
        find: '!Object.hasOwn(filled, key) || !sameValue[key]!(filled[key], submitted[key]),',
        replace: '!Object.hasOwn(filled, key),',
      },
    ],
    tests,
  },
  {
    name: 'the form keeps the revision its own save moved past',
    edits: [
      {
        file,
        find: 'expectKey === undefined ? Option.none() : currentRevision(root)',
        replace: 'Option.none()',
      },
    ],
    tests,
  },
  {
    name: 'another client’s save is not told',
    edits: [
      {
        file,
        find: "if (editor.filled) return moved(root) ? 'Moved' : 'Editing'",
        replace: "if (editor.filled) return 'Editing'",
      },
    ],
    tests,
  },
  {
    name: 'a save is taken again for every revision after it',
    edits: [
      {
        file: '../src/index.ts',
        find: 'if (requestId === null || Option.contains(editor.settledFor, requestId)) return root',
        replace: 'if (requestId === null) return root',
      },
    ],
    tests: settling,
  },
  {
    name: 'what a save sent is not what the row now holds',
    edits: [
      {
        file: '../src/index.ts',
        find: '...Option.getOrElse(editor.sent, () => ({})),',
        replace: '',
      },
    ],
    tests: settling,
  },
  {
    name: 'a landed create keeps its form',
    edits: [
      {
        file: '../src/index.ts',
        find: '...(editor.edited ? {} : { form: form.initial }),',
        replace: '',
      },
    ],
    tests: settling,
  },
  {
    name: 'an edit since the save does not show',
    edits: [
      {
        file: '../src/index.ts',
        find: "if (editor.edited) return moved(root) ? 'Moved' : 'Editing'",
        replace: '',
      },
    ],
    tests: settling,
  },
  {
    name: 'a save moved on by another still reads Saved',
    edits: [
      {
        file: '../src/index.ts',
        find: "return moved(root) ? 'Moved' : 'Saved'",
        replace: "return 'Saved'",
      },
    ],
    tests: settling,
  },
]
