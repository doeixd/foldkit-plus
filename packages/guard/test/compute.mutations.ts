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
        find: 'if (!(error instanceof QueryEvaluateError)) throw error',
        replace: 'throw error',
      },
    ],
    tests: ['packages/guard/test/compute.test.ts'],
  },
  {
    name: "an implementation's own message reaches the client",
    edits: [
      {
        file: '../src/server.ts',
        find: "message: `${entity.name}'s write could not be worked out to judge its rules`,",
        replace: 'message: String(error),',
      },
    ],
    tests: ['packages/guard/test/compute.test.ts'],
  },
  {
    name: 'what a write computes is worked out before the rules over the stored row',
    edits: [
      {
        file: '../src/server.ts',
        find: `        yield* require([rules.row, ...rules.members, ...relations], before, principal)
        // What the writer will store`,
        replace: `        // What the writer will store`,
      },
      {
        file: '../src/server.ts',
        find: `        yield* require([rules.row], after, principal)`,
        replace: `        yield* require([rules.row, ...rules.members, ...relations], before, principal)
        yield* require([rules.row], after, principal)`,
      },
    ],
    tests: ['packages/guard/test/compute.test.ts'],
  },
]
