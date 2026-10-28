/**
 * The server: handlers, headers, stores, admission, coalescing, broken in turn:
 * `pnpm mutate packages/media/test/server.mutations.ts` checks that a
 * test fails for every one.
 */
export default [
  {
    name: 'facts are read from a host that ends with an allowed one',
    edits: [
      {
        file: '../src/server/facts.ts',
        find: 'options.allow.includes(target.hostname)',
        replace: 'options.allow.some(allowed => target.hostname.endsWith(allowed))',
      },
    ],
    tests: ['packages/media/test/facts.test.ts'],
  },
  {
    name: 'facts are read over plain http',
    edits: [
      { file: '../src/server/facts.ts', find: "target.protocol === 'https:' && ", replace: '' },
    ],
    tests: ['packages/media/test/facts.test.ts'],
  },
  {
    name: 'a redirect is followed anywhere',
    edits: [
      {
        file: '../src/server/facts.ts',
        find: 'if (!allowed(target))',
        replace: 'if (hop === 0 && !allowed(target))',
      },
    ],
    tests: ['packages/media/test/facts.test.ts'],
  },
  {
    name: 'a body of any size is read',
    edits: [
      { file: '../src/server/facts.ts', find: 'if (size > maxBytes) {', replace: 'if (false) {' },
    ],
    tests: ['packages/media/test/facts.test.ts'],
  },
  {
    name: 'kept facts are asked for without their ETag',
    edits: [
      {
        file: '../src/server/facts.ts',
        find: "onSome: tag => ({ 'if-none-match': tag })",
        replace: 'onSome: () => ({})',
      },
    ],
    tests: ['packages/media/test/facts.test.ts'],
  },
  {
    name: 'a final ETag is sent to every redirect hop',
    edits: [
      {
        file: '../src/server/facts.ts',
        find: 'entry.target === target.href ? entry.etag : Option.none()',
        replace: 'entry.etag',
      },
    ],
    tests: ['packages/media/test/facts.test.ts'],
  },
  {
    name: 'an unchanged original is not taken from the kept facts',
    edits: [
      {
        file: '../src/server/facts.ts',
        find: 'if (response.status === 304 && Option.isSome(unchanged)) return unchanged.value.asset',
        replace: '',
      },
    ],
    tests: ['packages/media/test/facts.test.ts'],
  },
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
    name: 'a thrown materialization failure is not named',
    edits: [
      {
        file: '../src/server/materialize.ts',
        find: 'failed.push(`${path}: ${cause instanceof Error ? cause.message : String(cause)}`)',
        replace: 'throw cause',
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
        find: "Diagnostics.report(\n                      admissionFailed({ limiter: 'RateLimiter', client, cause: error }),\n                    ),",
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
    name: 'a malformed URL is kept a year, though a later release may read it',
    edits: [
      {
        file: '../src/server/headers.ts',
        find: 'Malformed: (): Record<string, string> => BRIEFLY,',
        replace: "Malformed: (): Record<string, string> => ({ 'cache-control': YEAR }),",
      },
    ],
    tests: ['packages/media/test/server.test.ts'],
  },
  {
    name: 'an original too large is kept a year, though a server may be let read more',
    edits: [
      {
        file: '../src/server/headers.ts',
        find: 'TooLarge: (): Record<string, string> => BRIEFLY,',
        replace: "TooLarge: (): Record<string, string> => ({ 'cache-control': YEAR }),",
      },
    ],
    tests: ['packages/media/test/server.test.ts', 'packages/media/test/sharp.test.ts'],
  },
  {
    name: 'a missing original is kept a year',
    edits: [
      {
        file: '../src/server/headers.ts',
        find: 'NotFound: (): Record<string, string> => BRIEFLY,',
        replace: "NotFound: (): Record<string, string> => ({ 'cache-control': YEAR }),",
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
        find: "Diagnostics.report(storeFailed({ store: 'variants', operation: 'read', key, cause })).pipe(\n          Effect.as(Option.none()),\n        ),",
        replace: 'Effect.die(cause),',
      },
    ],
    tests: ['packages/media/test/server.test.ts'],
  },
  {
    name: 'a variant store that fails a write fails the request',
    edits: [
      {
        file: '../src/server/stores.ts',
        find: "Effect.catch(cause =>\n          Diagnostics.report(storeFailed({ store: 'variants', operation: 'write', key, cause })),\n        ),",
        replace: 'Effect.orDie,',
      },
    ],
    tests: ['packages/media/test/server.test.ts'],
  },
  {
    name: 'a URL outside this space is kept a year as malformed',
    edits: [
      {
        file: '../src/server/handlers.ts',
        find: 'return Effect.succeed(refused(Answer.cases.Unoffered.make({})))',
        replace: 'return Effect.succeed(refused(Answer.cases.Malformed.make({})))',
      },
    ],
    tests: ['packages/media/test/server.test.ts', 'packages/media/test/hosted.test.ts'],
  },
  {
    name: 'a spelling no release could write is answered as unoffered',
    edits: [
      {
        file: '../src/server/handlers.ts',
        find: 'isSpelling(params.variant)',
        replace: 'true',
      },
    ],
    tests: ['packages/media/test/server.test.ts', 'packages/media/test/hosted.test.ts'],
  },
  {
    name: 'an unoffered URL is kept a year',
    edits: [
      {
        file: '../src/server/headers.ts',
        find: 'Unoffered: (): Record<string, string> => BRIEFLY,',
        replace: "Unoffered: (): Record<string, string> => ({ 'cache-control': YEAR }),",
      },
    ],
    tests: ['packages/media/test/server.test.ts'],
  },
  {
    name: 'a Worker coalesces by default, waiting on another request’s work',
    edits: [
      {
        file: '../src/server/fetch.ts',
        find: 'layer({ ...images, coalesce: false })',
        replace: 'layer({ ...images, coalesce: true })',
      },
    ],
    tests: ['packages/media/test/server.test.ts'],
  },
  {
    name: 'facts are read from any port of an allowed host',
    edits: [
      {
        file: '../src/server/facts.ts',
        find: "target.port === '' && ",
        replace: '',
      },
    ],
    tests: ['packages/media/test/facts.test.ts'],
  },
]
