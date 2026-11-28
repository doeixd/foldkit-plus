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
  {
    name: 'nullish transition inputs become empty objects during replay',
    edits: [
      {
        file: '../src/prove/transition.ts',
        find: "const input = at(env, ['input']) as Input",
        replace: "const input = (at(env, ['input']) ?? {}) as Input",
      },
    ],
    tests: ['packages/metakit/test/prove-review.test.ts'],
  },
  {
    name: 'the solver can invent a non-null value for a null-only input',
    edits: [
      {
        file: '../src/prove/lower.ts',
        find: 'const made = shape.absences.get(name)?.always === true ? z3.Bool.val(true) : z3.Bool.const(name)',
        replace: 'const made = z3.Bool.const(name)',
      },
    ],
    tests: ['packages/metakit/test/prove-review.test.ts'],
  },
]
