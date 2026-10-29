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
        find: 'Effect.andThen(unworkable)',
        replace: 'Effect.andThen(Effect.fail(new RemoteServerError({ message: String(error) })))',
      },
    ],
    tests: ['packages/guard/test/compute.test.ts'],
  },
  {
    name: 'what a write computes is worked out before the rules over the stored row',
    edits: [
      {
        file: '../src/server.ts',
        find: `        const requires = yield* rowRule(rules.row, before, principal)
        yield* require([...rules.members, ...relations], before, principal)
        // What the writer will store`,
        replace: `        // What the writer will store`,
      },
      {
        file: '../src/server.ts',
        find: `        const leaving = yield* rowRule(rules.row, after, principal)`,
        replace: `        const requires = yield* rowRule(rules.row, before, principal)
        yield* require([...rules.members, ...relations], before, principal)
        const leaving = yield* rowRule(rules.row, after, principal)`,
      },
    ],
    tests: ['packages/guard/test/compute.test.ts'],
  },
  {
    name: "the guard works a value out by the policy's table, not the writer's",
    edits: [
      {
        file: '../src/server.ts',
        find: 'const computing = writer.operators ?? policy.operators',
        replace: 'const computing = policy.operators',
      },
    ],
    tests: ['packages/guard/test/compute.test.ts'],
  },
  {
    name: 'a value the guard cannot work out is judged as it was',
    edits: [
      {
        file: '../src/server.ts',
        find: 'applied.unknown.length === 0 ? Effect.succeed(applied.row) : unworkable',
        replace: 'Effect.succeed(applied.row)',
      },
    ],
    tests: ['packages/guard/test/compute.test.ts'],
  },
  {
    name: 'the Drizzle writer names no table to judge by',
    edits: [
      {
        file: '../../remote-drizzle/src/index.ts',
        find: 'operators: binding.operators.memory,',
        replace: '',
      },
    ],
    tests: ['packages/guard/test/compute.test.ts'],
  },
  {
    name: 'an unpinned move is registered, to be refused on every request',
    edits: [
      {
        file: '../src/server.ts',
        find: `write.expect === undefined &&
        revision === undefined`,
        replace: `write.expect === undefined &&
        false`,
      },
    ],
    tests: ['packages/guard/test/increment.test.ts'],
  },
  {
    name: 'a moved member’s rule is judged over the stock it leaves',
    edits: [
      {
        file: '../src/server.ts',
        find: '({ rule, key }) => require([rule], { ...after, [key]: before[key] }, principal),',
        replace: '({ rule }) => require([rule], after, principal),',
      },
    ],
    tests: ['packages/guard/test/compute.test.ts'],
  },
]
