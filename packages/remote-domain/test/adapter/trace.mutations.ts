/**
 * The adapter's call to the Api, taken out of the caller's trace:
 * `pnpm mutate packages/remote-domain/test/adapter/trace.mutations.ts`.
 */
export default [
  {
    name: 'the command is sent under a tracer of its own, so its spans leave the trace',
    edits: [
      {
        file: '../../src/adapter/layer.ts',
        find: 'import { Context, Duration, Effect, Equal,',
        replace: "import { Tracer } from 'effect'\nimport { Context, Duration, Effect, Equal,",
      },
      {
        file: '../../src/adapter/layer.ts',
        find: 'yield* send(binding, commandId, target, input).pipe(',
        replace:
          'yield* send(binding, commandId, target, input).pipe(\n            Effect.provideService(Tracer.Tracer, Tracer.nativeTracer),',
      },
    ],
    tests: ['packages/remote-domain/test/adapter/trace.test.ts'],
  },
]
