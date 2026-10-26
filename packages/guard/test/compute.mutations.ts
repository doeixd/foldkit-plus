/**
 * A guarded write that computes, broken in turn:
 * `pnpm mutate packages/guard/test/compute.mutations.ts`.
 */
export default [
  {
    name: 'a policy that cannot compute an assignment is let through',
    edits: [
      {
        file: '../src/server.ts',
        find: '...write.assignments.flatMap(({ field, expr }) =>',
        replace: '...write.assignments.slice(0, 0).flatMap(({ field, expr }) =>',
      },
    ],
    tests: ['packages/guard/test/compute.test.ts'],
  },
  {
    name: 'an operator refusing its input ends the request as a defect',
    edits: [
      {
        file: '../src/server.ts',
        find: 'if (error instanceof QueryEvaluateError) {',
        replace: 'if (false) {',
      },
    ],
    tests: ['packages/guard/test/compute.test.ts'],
  },
]
