const mutation = (name: string, find: string, replace: string) => ({
  name,
  edits: [{ file: '../src/prove/solve.ts', find, replace }],
  tests: ['packages/metakit/test/solver-backend.test.ts'],
})

export default [
  mutation(
    'the prover ignores the injected solver backend',
    'const backend = yield* Solver',
    'const backend = z3Backend',
  ),
  mutation(
    'a solver assignment skips validation and replay',
    'valid(slices, env) && given.every(rule => holdsOf(rule, env)) && reproduces(env)',
    'true',
  ),
  {
    name: 'a cold Z3 worker receives only one interrupt',
    edits: [
      {
        file: '../src/prove/solve.ts',
        find: 'retry = setInterval(() => z3.interrupt(), 25)',
        replace: '',
      },
    ],
    tests: ['packages/metakit/test/z3-interrupt.test.ts'],
  },
]
