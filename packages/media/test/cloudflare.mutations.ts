/**
 * The Cloudflare layers, broken in turn:
 * `pnpm mutate packages/media/test/cloudflare.mutations.ts` checks that a
 * test fails for every one.
 */
export default [
  {
    name: 'a JPEG is taken to be transparent',
    edits: [
      {
        file: '../src/cloudflare/index.ts',
        find: "alpha: info.format !== 'image/jpeg',",
        replace: 'alpha: true,',
      },
    ],
    tests: ['packages/media/test/cloudflare.test.ts'],
  },
  {
    name: 'the binding’s refusal admits',
    edits: [
      {
        file: '../src/cloudflare/index.ts',
        find: 'success\n            ? Effect.void',
        replace: 'true\n            ? Effect.void',
      },
    ],
    tests: ['packages/media/test/cloudflare.test.ts'],
  },
  {
    name: 'the binding’s refusal ignores its retry',
    edits: [
      {
        file: '../src/cloudflare/index.ts',
        find: 'retryAfterSeconds: options.retryAfterSeconds ?? 60',
        replace: 'retryAfterSeconds: 1',
      },
    ],
    tests: ['packages/media/test/cloudflare.test.ts'],
  },
  {
    name: 'the binding may enlarge',
    edits: [
      {
        file: '../src/cloudflare/index.ts',
        find: "fit: 'scale-down'",
        replace: "fit: 'cover'",
      },
    ],
    tests: ['packages/media/test/cloudflare.test.ts'],
  },
  {
    name: 'the binding is asked for one format whatever the URL names',
    edits: [
      {
        file: '../src/cloudflare/index.ts',
        find: 'format: `image/${variant.format}`,',
        replace: "format: 'image/png',",
      },
    ],
    tests: ['packages/media/test/cloudflare.test.ts'],
  },
  {
    name: 'a spent allowance is a transform failure',
    edits: [
      {
        file: '../src/cloudflare/index.ts',
        find: 'cause.code === QUOTA_EXHAUSTED',
        replace: 'false',
      },
    ],
    tests: ['packages/media/test/cloudflare.test.ts'],
  },
  {
    name: 'a missing original is read anyway',
    edits: [
      {
        file: '../src/cloudflare/index.ts',
        find: 'object === null\n',
        replace: 'false\n',
      },
    ],
    tests: ['packages/media/test/cloudflare.test.ts'],
  },
  {
    name: 'a variant is kept outside its prefix',
    edits: [
      {
        file: '../src/cloudflare/index.ts',
        find: "options.prefix ?? 'variants/'))",
        replace: "options.prefix ?? ''))",
      },
    ],
    tests: ['packages/media/test/cloudflare.test.ts'],
  },
  {
    name: 'the edge cache is never filled',
    edits: [
      {
        file: '../src/cloudflare/index.ts',
        find: 'put: (key, encoded) => behind.put(key, encoded).pipe(Effect.andThen(fill(key, encoded))),',
        replace: 'put: (key, encoded) => behind.put(key, encoded),',
      },
    ],
    tests: ['packages/media/test/cloudflare.test.ts'],
  },
  {
    name: 'an edge read failure fails the image request',
    edits: [
      {
        file: '../src/cloudflare/index.ts',
        find: "Effect.logWarning('Media: the edge cache failed a read', cause).pipe(\n            Effect.as(Option.none<Kept>()),\n          )",
        replace: 'Effect.fail(cause)',
      },
    ],
    tests: ['packages/media/test/cloudflare.test.ts'],
  },
  {
    name: 'an edge write failure fails the image request',
    edits: [
      {
        file: '../src/cloudflare/index.ts',
        find: "Effect.catch(cause => Effect.logWarning('Media: the edge cache failed a write', cause))",
        replace: 'Effect.catch(cause => Effect.fail(cause))',
      },
    ],
    tests: ['packages/media/test/cloudflare.test.ts'],
  },
  {
    name: 'an R2 listing stops at its first page',
    edits: [
      {
        file: '../src/cloudflare/index.ts',
        find: 'cursor = page.truncated ? page.cursor : undefined',
        replace: 'cursor = undefined',
      },
    ],
    tests: ['packages/media/test/cloudflare.test.ts'],
  },
  {
    name: 'an upload is never put in the bucket',
    edits: [
      {
        file: '../src/cloudflare/index.ts',
        find: 'await bucket.put(hash, bytes)',
        replace: '',
      },
    ],
    tests: ['packages/media/test/cloudflare.test.ts'],
  },
  {
    name: '`cache: true` keeps no edge cache',
    edits: [
      {
        file: '../src/cloudflare/index.ts',
        find: 'onSome: cache => withEdge(kept, cacheOf(cache)),',
        replace: 'onSome: cache => (cache === true ? kept : withEdge(kept, cacheOf(cache))),',
      },
    ],
    tests: ['packages/media/test/cloudflare.test.ts'],
  },
  {
    name: '`cache: true` outside a Worker fails on first use, not at definition',
    edits: [
      {
        file: '../src/cloudflare/index.ts',
        find: "if (typeof caches === 'undefined') {",
        replace: 'if (false) {',
      },
    ],
    tests: ['packages/media/test/cloudflare.test.ts'],
  },
  {
    name: 'the facts of an upload in R2 are never found',
    edits: [
      {
        file: '../src/cloudflare/index.ts',
        find: 'return object === null ? Option.none() : Option.some(decodeFacts(await object.text()))',
        replace: 'return Option.none()',
      },
    ],
    tests: ['packages/media/test/cloudflare.test.ts'],
  },
]
