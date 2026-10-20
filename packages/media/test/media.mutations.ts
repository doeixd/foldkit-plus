/**
 * The core, broken in turn:
 * `pnpm mutate packages/media/test/media.mutations.ts` checks that a test
 * fails for every one.
 */
const layout = ['packages/media/test/layout.test.ts']
const provider = ['packages/media/test/provider.test.ts']
const picture = ['packages/media/test/picture.test.ts']
const hosted = ['packages/media/test/hosted.test.ts']
const server = ['packages/media/test/server.test.ts']
const cloudflare = ['packages/media/test/cloudflare.test.ts']
const sharpTests = ['packages/media/test/sharp.test.ts']

export default [
  {
    name: 'a repeated width is accepted',
    edits: [
      {
        file: '../src/widths.ts',
        find: 'if (sorted[index] === sorted[index - 1]) {',
        replace: 'if (false) {',
      },
    ],
    tests: layout,
  },
  {
    name: 'the ladder decodes any number',
    edits: [
      {
        file: '../src/widths.ts',
        find: 'Schema: Schema.Literals(sorted)',
        replace: 'Schema: Schema.Number',
      },
    ],
    tests: layout,
  },
  {
    name: 'a fixed image skips its 2x',
    edits: [
      {
        file: '../src/layout.ts',
        find: 'atLeast(widths, width), atLeast(widths, 2 * width)]',
        replace: 'atLeast(widths, width)]',
      },
    ],
    tests: layout,
  },
  {
    name: 'a constrained image takes the whole ladder',
    edits: [
      {
        file: '../src/layout.ts',
        find: 'return widths.values.filter(value => value <= top)',
        replace: 'return widths.values',
      },
    ],
    tests: layout,
  },
  {
    name: 'a width above the original is described as asked',
    edits: [
      {
        file: '../src/layout.ts',
        find: 'const described = Math.min(request, intrinsic)',
        replace: 'const described = request',
      },
    ],
    tests: layout,
  },
  {
    name: 'every width above the original is kept',
    edits: [
      {
        file: '../src/layout.ts',
        find: 'if (result.at(-1)?.described !== described) result.push',
        replace: 'result.push',
      },
    ],
    tests: layout,
  },
  {
    name: 'a placeholder color may carry a declaration',
    edits: [{ file: '../src/asset.ts', find: String.raw`[0-9a-z%.,\s/+-]*`, replace: '.*' }],
    tests: provider,
  },
  {
    name: 'an absolute source with a query is written raw',
    edits: [
      {
        file: '../src/provider.ts',
        find: "return key.includes('?') ? encodeURIComponent(key) : key",
        replace: 'return key',
      },
    ],
    tests: provider,
  },
  {
    name: 'a layout may be infinitely wide',
    edits: [
      { file: '../src/layout.ts', find: 'Schema.Finite.check', replace: 'Schema.Number.check' },
    ],
    tests: layout,
  },
  {
    name: 'a second file for a variant replaces the first',
    edits: [
      {
        file: '../src/provider.ts',
        find: 'if (byVariant.has(variant)) {',
        replace: 'if (false) {',
      },
    ],
    tests: provider,
  },
  {
    name: 'any zone is accepted',
    edits: [{ file: '../src/provider.ts', find: '!HOSTNAME.test(zone)', replace: 'false' }],
    tests: provider,
  },
  {
    name: 'a variant the provider lacks is written anyway',
    edits: [
      {
        file: '../src/picture.ts',
        find: 'onNone: () => [],\n        onSome: url => [{ url, described: candidate.described }],',
        replace:
          "onNone: () => [{ url: 'missing', described: candidate.described }],\n        onSome: url => [{ url, described: candidate.described }],",
      },
    ],
    tests: picture,
  },
  {
    name: 'src is the first candidate',
    edits: [
      {
        file: '../src/picture.ts',
        find: 'own.find(entry => entry.described >= drawn)',
        replace: 'own.find(() => true)',
      },
    ],
    tests: picture,
  },
  {
    name: 'a lazy image gets no auto',
    edits: [
      {
        file: '../src/picture.ts',
        find: "priority || sizes.startsWith('auto') ? sizes : `auto, ${sizes}`",
        replace: 'sizes',
      },
    ],
    tests: picture,
  },
  {
    name: 'a page’s own auto is repeated',
    edits: [
      {
        file: '../src/picture.ts',
        find: "priority || sizes.startsWith('auto')",
        replace: 'priority',
      },
    ],
    tests: picture,
  },
  {
    name: 'a priority image loads lazily',
    edits: [
      {
        file: '../src/picture.ts',
        find: "loading: priority ? 'eager' : 'lazy'",
        replace: "loading: 'lazy'",
      },
    ],
    tests: picture,
  },
  {
    name: 'no image is drawn as an empty one',
    edits: [
      {
        file: '../src/picture.ts',
        find: 'if (own.length === 0) return Option.none()',
        replace: '',
      },
    ],
    tests: picture,
  },
  {
    name: 'a transparent image gets a placeholder',
    edits: [
      {
        file: '../src/picture.ts',
        find: 'placeholder: asset.alpha\n      ? Option.none()\n      : background(',
        replace: 'placeholder: false\n      ? Option.none()\n      : background(',
      },
    ],
    tests: picture,
  },
  {
    name: 'a url is written unescaped',
    edits: [
      {
        file: '../src/placeholder.ts',
        find: '`url("${url.replace(',
        replace: '`url("${url}${"".replace(',
      },
    ],
    tests: picture,
  },
  {
    name: 'a low-res placeholder takes the largest width',
    edits: [
      {
        file: '../src/placeholder.ts',
        find: 'width: provider.widths.values[0]!',
        replace: 'width: provider.widths.values.at(-1)!',
      },
    ],
    tests: picture,
  },
  {
    name: 'a ThumbHash’s picture paints as its text',
    edits: [
      {
        file: '../src/placeholder.ts',
        find: "level === 'detail' ? cssUrl(decode(hash)) : average(hash)",
        replace: "level === 'detail' ? hash : average(hash)",
      },
    ],
    tests: picture,
  },
  {
    name: 'a preload ignores the sources',
    edits: [
      {
        file: '../src/picture.ts',
        find: 'const [first] = sources',
        replace: 'const first = undefined as Source | undefined',
      },
    ],
    tests: picture,
  },
  {
    name: 'a preload drops the type',
    edits: [{ file: '../src/picture.ts', find: "[['type', first.type] as const]", replace: '[]' }],
    tests: picture,
  },
  {
    name: 'a preload writes values raw',
    edits: [{ file: '../src/picture.ts', find: '${escapeAttribute(value)}', replace: '${value}' }],
    tests: picture,
  },
  {
    name: 'every placeholder paints its picture',
    edits: [
      { file: '../src/picture.ts', find: "(priority ? 'detail' : 'average')", replace: "'detail'" },
    ],
    tests: picture,
  },
  {
    name: 'no placeholder paints its picture',
    edits: [
      {
        file: '../src/picture.ts',
        find: "(priority ? 'detail' : 'average')",
        replace: "'average'",
      },
    ],
    tests: picture,
  },
  {
    name: 'an average color is the first pixel’s',
    edits: [
      {
        file: '../src/placeholder.ts',
        find: 'const { r, g, b, a } = thumbHashToAverageRGBA(bytesOf(hash))',
        replace: 'const { r, g, b, a } = { r: 1, g: 1, b: 1, a: 1 }',
      },
    ],
    tests: picture,
  },
  {
    name: 'a focal point outside the image is accepted',
    edits: [
      {
        file: '../src/asset.ts',
        find: 'Schema.isBetween({ minimum: 0, maximum: 1 })',
        replace: 'Schema.isBetween({ minimum: 0, maximum: 2 })',
      },
    ],
    tests: provider,
  },
  {
    name: 'transforms are not limited',
    edits: [
      {
        file: '../src/server/services.ts',
        find: 'Semaphore.withPermit(permits)(inner.transform(original, variant))',
        replace: 'inner.transform(original, variant)',
      },
    ],
    tests: sharpTests,
  },
  {
    name: 'sharp decodes an original of any size',
    edits: [
      {
        file: '../src/sharp/index.ts',
        find: 'if (width * height > maxPixels) {',
        replace: 'if (false) {',
      },
    ],
    tests: sharpTests,
  },
  {
    name: 'sharp enlarges',
    edits: [
      {
        file: '../src/sharp/index.ts',
        find: '.resize({ width: variant.width, withoutEnlargement: true })',
        replace: '.resize({ width: variant.width })',
      },
    ],
    tests: sharpTests,
  },
  {
    name: 'sharp ignores the quality',
    edits: [
      {
        file: '../src/sharp/index.ts',
        find: 'onSome: quality => ({ quality })',
        replace: 'onSome: () => ({})',
      },
    ],
    tests: sharpTests,
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
    tests: server,
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
    tests: server,
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
    tests: server,
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
    tests: server,
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
    tests: server,
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
    tests: server,
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
    tests: cloudflare,
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
    tests: cloudflare,
  },
  {
    name: 'a space takes any format',
    edits: [
      {
        file: '../src/variant.ts',
        find: 'format: Schema.Literals(formats),',
        replace: 'format: Format,',
      },
    ],
    tests: hosted,
  },
  {
    name: 'a space takes any quality',
    edits: [
      {
        file: '../src/variant.ts',
        find: 'quality: Schema.Option(Schema.Literals(qualities)),',
        replace: 'quality: Schema.Option(Quality),',
      },
    ],
    tests: hosted,
  },
  {
    name: 'a space takes a repeated format',
    edits: [{ file: '../src/variant.ts', find: "distinct('format', formats)", replace: '' }],
    tests: hosted,
  },
  {
    name: 'the hosted provider offers a format its server does not make',
    edits: [
      {
        file: '../src/provider.ts',
        find: 'if (!space.formats.includes(format)) {',
        replace: 'if (false) {',
      },
    ],
    tests: hosted,
  },
  {
    name: 'the hosted provider names a quality its server does not make',
    edits: [
      {
        file: '../src/provider.ts',
        find: '!space.qualities.includes(quality.value)',
        replace: 'false',
      },
    ],
    tests: hosted,
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
    tests: server,
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
    tests: server,
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
    tests: server,
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
    tests: server,
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
    tests: server,
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
    tests: server,
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
    tests: server,
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
    tests: server,
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
    tests: server,
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
    tests: server,
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
    tests: [...server, ...cloudflare],
  },
  {
    name: 'a weak ETag never matches',
    edits: [
      { file: '../src/server/headers.ts', find: String.raw`.replace(/^W\//, '')`, replace: '' },
    ],
    tests: server,
  },
  {
    name: 'any is no ETag',
    edits: [{ file: '../src/server/headers.ts', find: "tag === '*' || ", replace: '' }],
    tests: server,
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
    tests: server,
  },
  {
    name: 'the router is built for every request',
    edits: [{ file: '../src/server/handlers.ts', find: 'built.set(env, answer)', replace: '' }],
    tests: server,
  },
  {
    name: 'the binding may enlarge',
    edits: [
      { file: '../src/cloudflare/index.ts', find: "fit: 'scale-down'", replace: "fit: 'cover'" },
    ],
    tests: cloudflare,
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
    tests: cloudflare,
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
    tests: cloudflare,
  },
  {
    name: 'a missing original is read anyway',
    edits: [{ file: '../src/cloudflare/index.ts', find: 'object === null\n', replace: 'false\n' }],
    tests: cloudflare,
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
    tests: cloudflare,
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
    tests: cloudflare,
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
    tests: cloudflare,
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
    tests: server,
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
    tests: server,
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
    tests: server,
  },
  {
    name: 'a variant may be spelled with a leading zero',
    edits: [
      {
        file: '../src/variant.ts',
        find: String.raw`/^w([1-9]\d{0,4})`,
        replace: String.raw`/^w(\d{1,5})`,
      },
    ],
    tests: hosted,
  },
  {
    name: 'a quality may be spelled with a leading zero',
    edits: [
      {
        file: '../src/variant.ts',
        find: String.raw`(?:q([1-9]\d?|100))?`,
        replace: String.raw`(?:q(\d{1,3}))?`,
      },
    ],
    tests: hosted,
  },
  {
    name: 'a hash may be uppercase',
    edits: [
      { file: '../src/variant.ts', find: '/^[0-9a-f]{64}$/', replace: '/^[0-9a-fA-F]{64}$/' },
    ],
    tests: hosted,
  },
  {
    name: 'the hosted provider drops its quality',
    edits: [
      {
        file: '../src/provider.ts',
        find: 'encodeVariant({ width, format: encoding, quality })',
        replace: 'encodeVariant({ width, format: encoding, quality: Option.none() })',
      },
    ],
    tests: hosted,
  },
  {
    name: 'the hosted provider leaves the hash out',
    edits: [{ file: '../src/provider.ts', find: ".replace(':hash', hash)", replace: '' }],
    tests: hosted,
  },
  {
    name: 'any base URL is accepted',
    edits: [
      { file: '../src/provider.ts', find: "if (baseUrl !== '' && !", replace: 'if (false && !' },
    ],
    tests: hosted,
  },
]
