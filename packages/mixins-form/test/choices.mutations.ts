/**
 * A key the schema says is any number of literals, drawn as a group of
 * checkboxes, broken in turn: `pnpm mutate packages/mixins-form/test/choices.mutations.ts`.
 */
const file = '../src/index.ts'
const tests = ['packages/mixins-form/test/choices.test.ts']

export default [
  {
    name: 'a choice group offers nothing to choose',
    edits: [
      {
        file,
        find: '(Input.Choices.is(context.control) ? context.control.data.options : []).map(option => ({',
        replace: '[].map(option => ({',
      },
    ],
    tests,
  },
  {
    name: 'a chosen option is not shown as chosen',
    edits: [{ file, find: 'h.Checked(isChosen.has(option.value))', replace: 'h.Checked(false)' }],
    tests,
  },
  {
    name: 'a choice group is not named by its key, so a post carries nothing',
    edits: [
      {
        file,
        find: 'h.Name(input.control.key),\n            h.Value(option.value),',
        replace: 'h.Value(option.value),',
      },
    ],
    tests,
  },
]
