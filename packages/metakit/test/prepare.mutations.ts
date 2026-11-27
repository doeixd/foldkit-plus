/**
 * `Interpreter.prepare` guards broken in turn:
 * `pnpm mutate packages/metakit/test/prepare.mutations.ts` checks that a test
 * fails for every one.
 */
const tests = ['packages/metakit/test/prepare.test.ts']

export default [
  {
    name: 'compiled If ignores false branch and returns null',
    edits: [
      {
        file: '../src/interpreter.ts',
        find: `          if (c === true) return thenFn(env)
          if (c === false) return elseFn(env)`,
        replace: `          if (c === true) return thenFn(env)
          if (c === false) return null`,
      },
    ],
    tests,
  },
  {
    name: 'compiled Match returns null instead of unmatched Refusal',
    edits: [
      {
        file: '../src/interpreter.ts',
        find: `          if (target === null) return null
          return new Node.Refusal({
            reason: 'unmatched',`,
        replace: `          if (target === null) return null
          return null
          return new Node.Refusal({
            reason: 'unmatched',`,
      },
    ],
    tests,
  },
  {
    name: 'prepare marks Opaque expressions as compiled instead of hybrid',
    edits: [
      {
        file: '../src/interpreter.ts',
        find: `      Opaque: ({ run }): CompiledFn => {
        hybrid = true`,
        replace: `      Opaque: ({ run }): CompiledFn => {
        hybrid = false`,
      },
    ],
    tests,
  },
  {
    name: 'prepare.evaluate succeeds with Refusal instead of failing Effect',
    edits: [
      {
        file: '../src/interpreter.ts',
        find: `        const out = evaluateSync(env)
        return Node.isRefusal(out) ? Effect.fail(out) : Effect.succeed(out)`,
        replace: `        const out = evaluateSync(env)
        return Effect.succeed(out as A | null)`,
      },
    ],
    tests,
  },
]
