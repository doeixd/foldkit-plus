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
        find: "refuseGivenNul(nul, [\n        [node.left, left],\n        [node.right, right],\n      ])\n      refuseGivenNaN('an equality', [\n        [node.left, left],\n        [node.right, right],\n      ])\n      if (isNull(left) || isNull(right)) return 'unknown'\n      if (isUnheld(left)) return left\n      if (isUnheld(right)) return right\n      if (holdsNul(left) || holdsNul(right)) throw new QueryEvaluateError(nul)\n",
        replace:
          "if (isNull(left) || isNull(right)) return 'unknown'\n      if (isUnheld(left)) return left\n      if (isUnheld(right)) return right\n",
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
