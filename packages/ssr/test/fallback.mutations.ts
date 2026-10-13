/**
 * A posted form's own resources, each step broken in turn: `pnpm mutate
 * packages/ssr/test/fallback.mutations.ts` checks that a test fails for every
 * one.
 */
const file = '../src/index.ts'
const tests = ['packages/ssr/test/fallback.test.ts']

export default [
  {
    name: "the post's resources never reach its Commands",
    edits: [
      {
        file,
        find: 'const own = Effect.provide(command.effect, post)',
        replace: 'const own = command.effect',
      },
    ],
    tests,
  },
  {
    name: "the config's resources win over the post's",
    edits: [
      {
        file,
        find: `      const own = Effect.provide(command.effect, post)
      const provided: Effect.Effect<unknown, unknown, never> =
        config.resources === undefined
          ? (own as Effect.Effect<unknown, unknown, never>)
          : (Effect.provide(own, config.resources) as Effect.Effect<unknown, unknown, never>)`,
        replace: `      const own =
        config.resources === undefined
          ? command.effect
          : Effect.provide(command.effect, config.resources)
      const provided = Effect.provide(own, post) as Effect.Effect<unknown, unknown, never>`,
      },
    ],
    tests,
  },
  {
    name: "the entry never hands the request's resources on",
    edits: [
      {
        file,
        find: '...(options.resources === undefined ? {} : { resources: options.resources(request) }),',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: "a post's resources are never closed",
    edits: [
      {
        file,
        find: 'yield* Layer.build(options.resources)',
        replace: 'yield* Layer.buildWithScope(options.resources, Scope.makeUnsafe())',
      },
      {
        file,
        find: "import { Cause, Context, Effect, Exit, Layer, Option, Result, Schema } from 'effect'",
        replace:
          "import { Cause, Context, Effect, Exit, Layer, Option, Result, Schema, Scope } from 'effect'",
      },
    ],
    tests,
  },
  {
    name: "a post's resources are built before it is read",
    edits: [
      {
        file,
        find: "      if (plan.fallback !== 'server' || plan.Message === undefined) {",
        replace:
          "      if (options.resources !== undefined) yield* Layer.build(options.resources)\n      if (plan.fallback !== 'server' || plan.Message === undefined) {",
      },
    ],
    tests,
  },
]
