/**
 * `SSR.hydrate`'s `prepare` (#347), broken in turn: `pnpm mutate
 * packages/ssr/test/hydratePrepare.mutations.ts` checks that a test fails for
 * each.
 */
const client = '../src/client.ts'
const tests = ['packages/ssr/test/hydratePrepare.test.ts']
const call = '  else void Effect.runPromise(prepare(startingModel)).then(adoptFrom)\n'

export default [
  {
    name: 'the runtime starts from the resumed Model, not the prepared one',
    edits: [
      {
        file: client,
        find: call,
        replace:
          '  else void Effect.runPromise(prepare(startingModel)).then(() => adoptFrom(startingModel))\n',
      },
    ],
    tests,
  },
  {
    name: 'the page is adopted before prepare answers',
    edits: [
      {
        file: client,
        find: call,
        replace:
          '  else {\n    void Effect.runPromise(prepare(startingModel))\n    adoptFrom(startingModel)\n  }\n',
      },
    ],
    tests,
  },
]
