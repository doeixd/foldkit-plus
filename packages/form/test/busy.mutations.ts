/**
 * A submit waiting on a Bundle control's work, broken in turn:
 * `pnpm mutate packages/form/test/busy.mutations.ts`.
 */
const file = '../src/index.ts'
const tests = [
  'packages/form/test/bundleControl.test.ts',
  'packages/form-recipes/test/image.test.ts',
]

export default [
  {
    name: 'a submit does not wait for work in flight',
    edits: [
      {
        file,
        find: 'plans[key].bundled?.busy(drafts(model)[key].value) === true',
        replace: 'false',
      },
    ],
    tests,
  },
  {
    name: 'a busy key is called missing at once',
    edits: [
      {
        file,
        find: 'next = withField(next, key, FieldValidation.Validating({ value: state.value }))\n          continue',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'work that ends without a value leaves its key unvalidated',
    edits: [
      {
        file,
        find: 'if (!ended) return resume(moved, lifted)',
        replace: 'return resume(moved, lifted)',
      },
    ],
    tests,
  },
  {
    name: 'the work landing does not send the waiting submit',
    edits: [
      {
        file,
        find: '? resume({ ...edit.model, submitPending: true }, [...lifted, ...edit.commands])',
        replace: '? { model: edit.model, commands: [...lifted, ...edit.commands] }',
      },
    ],
    tests,
  },
]
