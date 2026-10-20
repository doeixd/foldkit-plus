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
        find: 'placeholder: asset.alpha ? Option.none() : background(asset, provider)',
        replace: 'placeholder: background(asset, provider)',
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
    name: 'a ThumbHash paints as a color',
    edits: [
      {
        file: '../src/placeholder.ts',
        find: 'ThumbHash: ({ hash }) => Option.some(cssUrl(decode(hash))),',
        replace: 'ThumbHash: ({ hash }) => Option.some(hash),',
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
    name: 'a variant made is not kept',
    edits: [
      {
        file: '../src/server/handlers.ts',
        find: '.pipe(Effect.tap(made => variants.put(key, made)))',
        replace: '',
      },
    ],
    tests: server,
  },
  {
    name: 'every variant of an original is kept under one key',
    edits: [
      {
        file: '../src/server/handlers.ts',
        find: 'const key = `${spell(params.variant)}/${params.hash}`',
        replace: 'const key = params.hash',
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
    name: 'a variant is served without its cache header',
    edits: [
      {
        file: '../src/server/handlers.ts',
        find: "headers: { 'cache-control': IMMUTABLE },",
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
        find: 'bucket.put(prefix + key,',
        replace: 'bucket.put(key,',
      },
    ],
    tests: cloudflare,
  },
  {
    name: 'the edge cache is never filled',
    edits: [
      {
        file: '../src/cloudflare/index.ts',
        find: 'onSome: edge => Effect.promise(() => edge.put(cacheKey(key), cached(encoded) as never)),',
        replace: 'onSome: () => Effect.void,',
      },
    ],
    tests: cloudflare,
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
