/**
 * Keys a form draws but does not let anyone edit, broken in turn:
 * `pnpm mutate packages/mixins-form/test/locked.mutations.ts`.
 */
const file = '../src/index.ts'
const tests = ['packages/mixins-form/test/view.test.ts']

export default [
  {
    name: 'a locked control is drawn editable',
    edits: [
      {
        file,
        find: '...(input.locked === true ? [h.Disabled(true)] : []),\n      ]',
        replace: '\n      ]',
      },
    ],
    tests,
  },
  {
    name: 'a locked many picker’s choices are editable',
    edits: [
      {
        file,
        find: '...(input.locked === true ? [h.Disabled(true)] : []),\n            h.OnClick(',
        replace: 'h.OnClick(',
      },
    ],
    tests,
  },
  {
    name: 'the view’s locked keys are not read',
    edits: [{ file, find: "locked: path === '' && locked.has(key),", replace: 'locked: false,' }],
    tests,
  },
  {
    name: 'a row’s key is locked by the form’s key of its name',
    edits: [
      {
        file,
        find: "locked: path === '' && locked.has(key),",
        replace: 'locked: locked.has(key),',
      },
    ],
    tests,
  },
  {
    name: 'a locked key is not posted',
    edits: [{ file, find: '? posted(draft).map(value =>', replace: '? [].map((value: string) =>' }],
    tests,
  },
]
