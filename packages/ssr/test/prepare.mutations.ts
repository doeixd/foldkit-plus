/**
 * `SSR.entry`'s `prepare` (#393), broken in turn: `pnpm mutate
 * packages/ssr/test/prepare.mutations.ts` checks that a test fails for each.
 */
const index = '../src/index.ts'
const tests = ['packages/ssr/test/prepare.test.ts']

export default [
  {
    name: 'a page is rendered from init’s Model',
    edits: [
      {
        file: index,
        find: 'Option.match(started, { onNone: () => config, onSome: ({ config }) => config })',
        replace: 'config',
      },
    ],
    tests,
  },
  {
    name: 'a post starts from init’s Model',
    edits: [
      {
        file: index,
        find: 'const start =\n        prepare === undefined ? started.model : yield* Effect.orDie(prepare(started.model, request))',
        replace: 'const start = started.model',
      },
    ],
    tests,
  },
  {
    name: 'a posted Message is judged by init’s Model',
    edits: [
      {
        file: index,
        find: 'allowedTags(plan, start)',
        replace: 'allowedTags(plan, started.model)',
      },
    ],
    tests,
  },
  {
    name: 'a prepared page drops the Commands init returned',
    edits: [
      {
        file: index,
        find: 'startingFrom(config, { ...started, model })',
        replace: 'startingFrom(config, { model })',
      },
    ],
    tests,
  },
]
