/**
 * The core journal layer's lifetime, each broken in turn: `pnpm mutate packages/durable/test/core.mutations.ts` checks that a
 * test fails for every one.
 */
export default [
  {
    name: 'the journal closes as soon as it opens',
    edits: [
      {
        file: '../src/service.ts',
        find: '    makeJournalOn(options),\n  )',
        replace: '    Effect.scoped(makeJournalOn(options)),\n  )',
      },
      {
        file: '../src/service.ts',
        find: "import { Context, Layer } from 'effect'",
        replace: "import { Context, Effect, Layer } from 'effect'",
      },
    ],
    tests: ['packages/durable/test/core.test.ts'],
  },
  {
    name: 'the journal outlives its layer',
    edits: [
      {
        file: '../src/service.ts',
        find: '    makeJournalOn(options),\n  )',
        replace:
          '    Effect.flatMap(Scope.make(), scope => makeJournalOn(options).pipe(Effect.provideService(Scope.Scope, scope))),\n  )',
      },
      {
        file: '../src/service.ts',
        find: "import { Context, Layer } from 'effect'",
        replace: "import { Context, Effect, Layer, Scope } from 'effect'",
      },
    ],
    tests: ['packages/durable/test/core.test.ts'],
  },
]
