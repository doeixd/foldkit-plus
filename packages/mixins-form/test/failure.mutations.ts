/**
 * The form's write failure, and its saved button, broken: `pnpm mutate packages/mixins-form/test/failure.mutations.ts`.
 */
const file = '../src/index.ts'
const tests = ['packages/mixins-form/test/view.test.ts']

export default [
  {
    name: 'the failure is never drawn',
    edits: [{ file, find: '...(input.failure === undefined', replace: '...(true' }],
    tests,
  },
  {
    name: 'the button offers the write again after a refusal too',
    edits: [
      { file, find: 'input.failure?.retry === true', replace: 'input.failure !== undefined' },
    ],
    tests,
  },
  {
    name: 'the button never offers the write again',
    edits: [{ file, find: 'input.failure?.retry === true', replace: 'false' }],
    tests,
  },
  {
    name: 'a saved form’s button is disabled',
    edits: [
      {
        file,
        find: 'h.Disabled(!input.canSubmit && !saved),',
        replace: 'h.Disabled(!input.canSubmit),',
      },
    ],
    tests,
  },
  {
    name: 'a saved form that can submit is marked aria-disabled',
    edits: [
      { file, find: 'submitting || (saved && !input.canSubmit)', replace: 'submitting || saved' },
    ],
    tests,
  },
]
