/**
 * An optional key in a form's value, broken in turn:
 * `pnpm mutate packages/form/test/optional.mutations.ts`.
 */
const file = '../src/index.ts'
const tests = ['packages/form/test/optional.test.ts']

export default [
  {
    name: 'a filled draft not checked yet is left out of the value',
    edits: [
      {
        file,
        find: "(field._tag !== 'NotValidated' || Result.isSuccess(plans[key].check(field.value)))",
        replace: 'true',
      },
    ],
    tests,
  },
  {
    name: 'a draft not checked yet is never acceptable',
    edits: [
      {
        file,
        find: "(field._tag !== 'NotValidated' || Result.isSuccess(plans[key].check(field.value)))",
        replace: "field._tag !== 'NotValidated'",
      },
    ],
    tests,
  },
]
