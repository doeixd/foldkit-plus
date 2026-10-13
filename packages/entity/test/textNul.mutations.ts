/**
 * The reference interpreter's refusal of NUL, broken in turn:
 * `pnpm mutate packages/entity/test/textNul.mutations.ts`.
 */
const tests = ['packages/entity/test/query-values.test.ts']
const file = '../src/evaluate.ts'

export default [
  {
    name: 'an equality answers text holding NUL',
    edits: [
      {
        file,
        find: "if (holdsNul(left) || holdsNul(right)) {\n        throw new QueryEvaluateError(\n          'an equality",
        replace: "if (false) {\n        throw new QueryEvaluateError(\n          'an equality",
      },
    ],
    tests,
  },
  {
    name: 'a membership test answers text holding NUL',
    edits: [
      { file, find: 'if (holdsNul(value) || among.some(holdsNul)) {', replace: 'if (false) {' },
    ],
    tests,
  },
]
