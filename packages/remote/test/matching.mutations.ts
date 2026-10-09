/**
 * Local judging, broken in turn: `pnpm mutate packages/remote/test/matching.mutations.ts`.
 */
export default [
  {
    name: 'a refused filter ends the update',
    edits: [
      {
        file: '../src/index.ts',
        find: 'if (error instanceof QueryEvaluateError) return { items: [], complete: false }',
        replace: '',
      },
    ],
    tests: ['packages/remote/test/filtered.test.ts'],
  },
  {
    name: 'a refused live judgement ends the update',
    edits: [
      {
        file: '../src/matching.ts',
        find: "if (error instanceof QueryEvaluateError) return 'unknown'",
        replace: '',
      },
    ],
    tests: ['packages/remote/test/liveBelongs.test.ts'],
  },
  {
    name: 'a refused live judgement hides the row',
    edits: [
      {
        file: '../src/matching.ts',
        find: "if (error instanceof QueryEvaluateError) return 'unknown'",
        replace: "if (error instanceof QueryEvaluateError) return 'no'",
      },
    ],
    tests: ['packages/remote/test/liveBelongs.test.ts'],
  },
]
