/**
 * Mutation spec verifying the tests for GitHub issues #638, #639, and #641 can fail.
 */
export default [
  {
    name: 'optional-union-refinement-dropped',
    edits: [
      {
        file: '../src/expr.ts',
        find: 'if (nullish.length > 0 && presentMembers.length === 1) {',
        replace: 'if (false && nullish.length > 0 && presentMembers.length === 1) {',
      },
    ],
    tests: ['packages/metakit/test/rules.test.ts'],
  },
  {
    name: 'inspect-check-annotation-skipped',
    edits: [
      {
        file: '../src/inspect.ts',
        find: 'if (ast.checks !== undefined) {',
        replace: 'if (false && ast.checks !== undefined) {',
      },
    ],
    tests: ['packages/metakit/test/inspect.test.ts'],
  },
  {
    name: 'nested-rows-binder-collision',
    edits: [
      {
        file: '../src/ops/arr.ts',
        find: 'export const currentEach = (): string => (bodyDepth === 0 ? Node.EACH : `${Node.EACH}#${bodyDepth}`)',
        replace: 'export const currentEach = (): string => Node.EACH',
      },
    ],
    tests: ['packages/metakit/test/rows.test.ts'],
  },
]
