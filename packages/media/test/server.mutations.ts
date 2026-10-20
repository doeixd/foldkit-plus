/**
 * The server: handlers, headers, stores, admission, coalescing, broken in turn:
 * `pnpm mutate packages/media/test/server.mutations.ts` checks that a
 * test fails for every one.
 */
export default [
  {
    name: 'a variant two pages name is made twice',
    edits: [
      {
        file: '../src/server/materialize.ts',
        find: '...new Set(options.pages.flatMap(page => page.html.match(VARIANT_PATH) ?? [])),',
        replace: '...options.pages.flatMap(page => page.html.match(VARIANT_PATH) ?? []),',
      },
    ],
    tests: ['packages/media/test/materialize.test.ts'],
  },
  {
    name: 'a variant that cannot be made is left out quietly',
    edits: [
      {
        file: '../src/server/materialize.ts',
        find: 'failed.push(`${path}: ${response.status}`)',
        replace: '',
      },
    ],
    tests: ['packages/media/test/materialize.test.ts'],
  },
  {
    name: 'any number of variants is written',
    edits: [
      {
        file: '../src/server/materialize.ts',
        find: 'if (paths.length > maxFiles) {',
        replace: 'if (false) {',
      },
    ],
    tests: ['packages/media/test/materialize.test.ts'],
  },
  {
    name: 'a _headers without the rule passes',
    edits: [
      {
        file: '../src/server/materialize.ts',
        find: '.some(line => line.trim() === PATTERN)',
        replace: '.some(() => true)',
      },
    ],
    tests: ['packages/media/test/materialize.test.ts'],
  },
  {
    name: 'the rule carries one answer’s ETag',
    edits: [
      {
        file: '../src/server/materialize.ts',
        find: ".filter(([name]) => name !== 'etag' && name !== 'server-timing')",
        replace: '',
      },
    ],
    tests: ['packages/media/test/materialize.test.ts'],
  },
  {
    name: 'concurrent misses never share',
    edits: [
      {
        file: '../src/server/handlers.ts',
        find: '(coalesce ? Cache.get(shared, key) : makeAndKeep(key, hash, variant))',
        replace: 'makeAndKeep(key, hash, variant)',
      },
    ],
    tests: ['packages/media/test/server.test.ts'],
  },
  {
    name: 'a Node server does not coalesce by default',
    edits: [
      {
        file: '../src/server/handlers.ts',
        find: 'handlers({ coalesce: true, ...options })',
        replace: 'handlers(options)',
      },
    ],
    tests: ['packages/media/test/server.test.ts'],
  },
  {
    name: 'a miss is never asked about',
    edits: [
      {
        file: '../src/server/handlers.ts',
        find: 'admit(client).pipe(\n              Effect.andThen(',
        replace: 'Effect.void.pipe(\n              Effect.andThen(',
      },
    ],
    tests: ['packages/media/test/server.test.ts'],
  },
  {
    name: 'every client is one client',
    edits: [
      {
        file: '../src/server/handlers.ts',
        find: "request.headers['cf-connecting-ip'] ?? ",
        replace: '',
      },
    ],
    tests: ['packages/media/test/server.test.ts'],
  },
  {
    name: 'a refusal does not say when to retry',
    edits: [
      {
        file: '../src/server/headers.ts',
        find: "      'retry-after': String(retryAfterSeconds),\n",
        replace: '',
      },
    ],
    tests: ['packages/media/test/server.test.ts'],
  },
  {
    name: 'a limiter that is down refuses',
    edits: [
      {
        file: '../src/server/admission.ts',
        find: "Effect.logWarning('Media: the rate limiter failed; admitting', error),",
        replace: 'Effect.fail(new RateLimited({ retryAfterSeconds: 1 })),',
      },
    ],
    tests: ['packages/media/test/server.test.ts'],
  },
  {
    name: 'a variant made is not kept',
    edits: [
      {
        file: '../src/server/handlers.ts',
        find: 'make(hash, variant).pipe(Effect.tap(made => variants.put(key, made)))',
        replace: 'make(hash, variant)',
      },
    ],
    tests: ['packages/media/test/server.test.ts'],
  },
  {
    name: 'every variant of an original is kept under one key',
    edits: [
      {
        file: '../src/server/handlers.ts',
        find: 'const key = `${hash}/${spell(variant)}`',
        replace: 'const key = hash',
      },
    ],
    tests: ['packages/media/test/server.test.ts'],
  },
  {
    name: 'an original of any size is transformed',
    edits: [
      {
        file: '../src/server/handlers.ts',
        find: 'if (original.size > maxBytes) {',
        replace: 'if (false) {',
      },
    ],
    tests: ['packages/media/test/server.test.ts'],
  },
  {
    name: 'a variant is not kept a year',
    edits: [
      {
        file: '../src/server/headers.ts',
        find: "      'cache-control': YEAR,\n      etag,",
        replace: "      'cache-control': 'no-store',\n      etag,",
      },
    ],
    tests: ['packages/media/test/server.test.ts'],
  },
  {
    name: 'a malformed URL is never kept',
    edits: [
      {
        file: '../src/server/headers.ts',
        find: "Malformed: (): Record<string, string> => ({ 'cache-control': YEAR }),",
        replace: "Malformed: (): Record<string, string> => ({ 'cache-control': 'no-store' }),",
      },
    ],
    tests: ['packages/media/test/server.test.ts'],
  },
  {
    name: 'a missing original is kept a year',
    edits: [
      {
        file: '../src/server/headers.ts',
        find: "      'cache-control': 'no-store',\n      'cdn-cache-control': 'public, max-age=60',",
        replace: "      'cache-control': YEAR,",
      },
    ],
    tests: ['packages/media/test/server.test.ts'],
  },
  {
    name: 'a failure is kept a year',
    edits: [
      {
        file: '../src/server/headers.ts',
        find: "Failed: (): Record<string, string> => ({ 'cache-control': 'no-store' }),",
        replace: "Failed: (): Record<string, string> => ({ 'cache-control': YEAR }),",
      },
    ],
    tests: ['packages/media/test/server.test.ts'],
  },
  {
    name: 'a spent allowance says nothing of when to retry',
    edits: [
      {
        file: '../src/server/headers.ts',
        find: "      'retry-after': EXHAUSTED_RETRY_SECONDS,\n",
        replace: '',
      },
    ],
    tests: ['packages/media/test/server.test.ts'],
  },
  {
    name: 'an image may be sniffed',
    edits: [
      {
        file: '../src/server/headers.ts',
        find: "  'x-content-type-options': 'nosniff',\n",
        replace: '',
      },
    ],
    tests: ['packages/media/test/server.test.ts'],
  },
  {
    name: 'an image may not be read by a canvas elsewhere',
    edits: [
      {
        file: '../src/server/headers.ts',
        find: "  'access-control-allow-origin': '*',\n",
        replace: '',
      },
    ],
    tests: ['packages/media/test/server.test.ts'],
  },
  {
    name: 'a variant says it was always made',
    edits: [
      {
        file: '../src/server/headers.ts',
        find: '`media;desc="${from}"`',
        replace: '`media;desc="made"`',
      },
    ],
    tests: ['packages/media/test/server.test.ts', 'packages/media/test/cloudflare.test.ts'],
  },
  {
    name: 'a weak ETag never matches',
    edits: [
      {
        file: '../src/server/headers.ts',
        find: ".replace(/^W\\//, '')",
        replace: '',
      },
    ],
    tests: ['packages/media/test/server.test.ts'],
  },
  {
    name: 'any is no ETag',
    edits: [
      {
        file: '../src/server/headers.ts',
        find: "tag === '*' || ",
        replace: '',
      },
    ],
    tests: ['packages/media/test/server.test.ts'],
  },
  {
    name: 'a request holding the variant is sent it again',
    edits: [
      {
        file: '../src/server/handlers.ts',
        find: 'if (matches(ifNoneMatch, etag)) return notModified(etag)',
        replace: '',
      },
    ],
    tests: ['packages/media/test/server.test.ts'],
  },
  {
    name: 'the router is built for every request',
    edits: [
      {
        file: '../src/server/handlers.ts',
        find: 'built.set(env, answer)',
        replace: '',
      },
    ],
    tests: ['packages/media/test/server.test.ts'],
  },
  {
    name: 'a kept variant’s type is not its key’s',
    edits: [
      {
        file: '../src/server/stores.ts',
        find: "return Schema.is(Format)(extension) ? mimeType(extension) : 'application/octet-stream'",
        replace: "return 'application/octet-stream'",
      },
    ],
    tests: ['packages/media/test/server.test.ts'],
  },
  {
    name: 'a variant store that fails a read fails the request',
    edits: [
      {
        file: '../src/server/stores.ts',
        find: "Effect.logWarning('Media: the variant store failed a read', error).pipe(\n          Effect.as(Option.none()),\n        ),",
        replace: 'Effect.die(error),',
      },
    ],
    tests: ['packages/media/test/server.test.ts'],
  },
  {
    name: 'a variant store that fails a write fails the request',
    edits: [
      {
        file: '../src/server/stores.ts',
        find: "Effect.catch(error => Effect.logWarning('Media: the variant store failed a write', error)),",
        replace: 'Effect.orDie,',
      },
    ],
    tests: ['packages/media/test/server.test.ts'],
  },
]
