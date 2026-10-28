/**
 * What the media server reports instead of failing, broken in turn:
 * `pnpm mutate packages/media/test/diagnostics.mutations.ts` checks that a
 * test fails for every one.
 */
const diagnostics = '../src/server/diagnostics.ts'
const server = ['packages/media/test/server.test.ts']
const cloudflare = ['packages/media/test/cloudflare.test.ts']

export default [
  {
    name: 'a variant store read that fails is not reported',
    edits: [
      {
        file: '../src/server/stores.ts',
        find: "Diagnostics.report(storeFailed({ store: 'variants', operation: 'read', key, cause })).pipe(",
        replace: 'Effect.void.pipe(',
      },
    ],
    tests: server,
  },
  {
    name: 'a variant store write that fails is not reported',
    edits: [
      {
        file: '../src/server/stores.ts',
        find: "Diagnostics.report(storeFailed({ store: 'variants', operation: 'write', key, cause })),",
        replace: 'Effect.void,',
      },
    ],
    tests: server,
  },
  {
    name: 'a store that fails is only a warning',
    edits: [
      {
        file: diagnostics,
        find: "  _tag: 'StoreFailed',\n  source,\n  level: 'error',",
        replace: "  _tag: 'StoreFailed',\n  source,\n  level: 'warning',",
      },
    ],
    tests: server,
  },
  {
    name: 'a RateLimiter that fails is not reported',
    edits: [
      {
        file: '../src/server/admission.ts',
        find: "Diagnostics.report(\n                      admissionFailed({ limiter: 'RateLimiter', client, cause: error }),\n                    ),",
        replace: 'Effect.void,',
      },
    ],
    tests: server,
  },
  {
    name: 'a rate limit binding that fails is not reported',
    edits: [
      {
        file: '../src/cloudflare/index.ts',
        find: "Diagnostics.report(admissionFailed({ limiter: 'binding', client, cause })).pipe(",
        replace: 'Effect.void.pipe(',
      },
    ],
    tests: cloudflare,
  },
  {
    name: 'an edge read that fails is not reported',
    edits: [
      {
        file: '../src/cloudflare/index.ts',
        find: "Diagnostics.report(storeFailed({ store: 'edge', operation: 'read', key, cause })).pipe(",
        replace: 'Effect.void.pipe(',
      },
    ],
    tests: cloudflare,
  },
  {
    name: 'an edge write that fails is not reported',
    edits: [
      {
        file: '../src/cloudflare/index.ts',
        find: "Diagnostics.report(storeFailed({ store: 'edge', operation: 'write', key, cause })),",
        replace: 'Effect.void,',
      },
    ],
    tests: cloudflare,
  },
  {
    name: 'a failed Images transform is not reported',
    edits: [
      {
        file: '../src/cloudflare/index.ts',
        find: "Diagnostics.report(imageFailed('transform', cause)).pipe(",
        replace: 'Effect.void.pipe(',
      },
    ],
    tests: cloudflare,
  },
  {
    name: 'a failed Images inspection is not reported',
    edits: [
      {
        file: '../src/cloudflare/index.ts',
        find: "Diagnostics.report(imageFailed('inspect', cause)).pipe(",
        replace: 'Effect.void.pipe(',
      },
    ],
    tests: cloudflare,
  },
  {
    name: 'a failed sharp call is not reported',
    edits: [
      {
        file: '../src/sharp/index.ts',
        find: '  Diagnostics.report(imageFailed(step, cause)).pipe(',
        replace: '  Effect.void.pipe(',
      },
    ],
    tests: ['packages/media/test/sharp.test.ts'],
  },
  {
    name: 'a failed inspection is an error',
    edits: [
      {
        file: diagnostics,
        find: "level: step === 'inspect' ? 'warning' : 'error',",
        replace: "level: 'error',",
      },
    ],
    tests: ['packages/media/test/sharp.test.ts', ...cloudflare],
  },
  {
    name: 'a failed image does not say why',
    edits: [
      {
        file: diagnostics,
        find: 'message: `Media.${step} failed (${String(cause)}),',
        replace: 'message: `Media.${step} failed,',
      },
    ],
    tests: ['packages/media/test/sharp.test.ts'],
  },
  {
    name: 'a facts cache read that fails is not reported',
    edits: [
      {
        file: '../src/server/facts.ts',
        find: "Diagnostics.report(\n            storeFailed({ store: 'facts', operation: 'read', key: cacheKey, cause }),\n          )",
        replace: 'Effect.void',
      },
    ],
    tests: ['packages/media/test/facts.test.ts'],
  },
  {
    name: 'a facts cache write that fails is not reported',
    edits: [
      {
        file: '../src/server/facts.ts',
        find: "Diagnostics.report(\n              storeFailed({ store: 'facts', operation: 'write', key: cacheKey, cause }),\n            ),",
        replace: 'Effect.void,',
      },
    ],
    tests: ['packages/media/test/facts.test.ts'],
  },
  {
    name: 'facts answered Unavailable are not reported',
    edits: [
      {
        file: '../src/server/upload.ts',
        find: 'Diagnostics.report(factsUnanswered(url, reason)).pipe(',
        replace: 'Effect.void.pipe(',
      },
    ],
    tests: ['packages/media/test/upload.test.ts'],
  },
  {
    name: 'a defect answered 500 is not reported',
    edits: [
      {
        file: '../src/server/handlers.ts',
        find: '{ disableLogger: true, middleware: Effect.tapCause(reportDefects) },',
        replace: '{ disableLogger: true },',
      },
    ],
    tests: server,
  },
  {
    name: 'the 500 the router answers is reported as a defect',
    edits: [
      {
        file: '../src/server/handlers.ts',
        find: 'reason => Cause.isDieReason(reason) && !HttpServerResponse.isHttpServerResponse(reason.defect),',
        replace: 'reason => Cause.isDieReason(reason),',
      },
    ],
    tests: server,
  },
  {
    name: 'every failure of a request is reported as a defect',
    edits: [
      {
        file: '../src/server/handlers.ts',
        find: 'reason => Cause.isDieReason(reason) && !HttpServerResponse.isHttpServerResponse(reason.defect),',
        replace:
          'reason => !(Cause.isDieReason(reason) && HttpServerResponse.isHttpServerResponse(reason.defect)),',
      },
    ],
    tests: server,
  },
  {
    name: "serveFetch hides its layer's reporter from what runs around the routes",
    edits: [
      {
        file: '../src/server/fetch.ts',
        find: 'layer({ ...images, coalesce: false }).pipe(Layer.provideMerge(images.layer(env))),',
        replace: 'layer({ ...images, coalesce: false }).pipe(Layer.provide(images.layer(env))),',
      },
    ],
    tests: server,
  },
]
