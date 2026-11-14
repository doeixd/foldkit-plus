/**
 * `lazy` as a function of the Model (#438), broken in turn: `pnpm mutate
 * packages/ssr/test/lazyRoute.mutations.ts` checks that a test fails for each.
 */
const index = '../src/index.ts'
const client = '../src/client.ts'
const shared = '../src/shared.ts'
const server = ['packages/ssr/test/lazyRoute.test.ts', 'packages/ssr/test/lazyServer.test.ts']
const browser = ['packages/ssr/test/lazyRouteBoot.test.ts']

export default [
  {
    name: 'the render starts from the start the function was asked with, not init again',
    edits: [
      {
        file: index,
        find: 'return startingFrom(config, started) as ResumableConfig<Model>',
        replace: 'return config',
      },
    ],
    tests: server,
  },
  {
    name: 'the server loads what the function names',
    edits: [
      {
        file: index,
        find: 'yield* Effect.promise(() => Promise.all(lazy(started.model).map(each => each.load())))',
        replace: 'lazy(started.model)',
      },
    ],
    tests: server,
  },
  {
    name: 'a list still loads whole',
    edits: [
      {
        file: index,
        find: 'yield* Effect.promise(() => Promise.all((lazy ?? []).map(each => each.load())))',
        replace: 'yield* Effect.void',
      },
    ],
    tests: server,
  },
  {
    name: 'the browser asks with the resumed Model',
    edits: [
      {
        file: client,
        find: 'const pending = lazyFor(config, model)',
        replace: 'const pending = lazyFor(config, plan.baseline)',
      },
    ],
    tests: browser,
  },
  {
    name: 'a function is called, not read as a list',
    edits: [
      {
        file: shared,
        find: "typeof config.lazy === 'function' ? config.lazy(model) : (config.lazy ?? [])",
        replace: "typeof config.lazy === 'function' ? [] : (config.lazy ?? [])",
      },
    ],
    tests: browser,
  },
]
