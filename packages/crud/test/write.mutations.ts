/**
 * An editor over a declared write, broken in turn:
 * `pnpm mutate packages/crud/test/write.mutations.ts`.
 */
const tests = ['packages/crud/test/write.test.ts']
const file = '../src/index.ts'

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
        find: "if (expectKey === undefined || saveOf(root)._tag !== 'Applied' || !moved(root))",
        replace: 'if (true)',
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
]
