/**
 * The core (widths, layout, providers, the picture, placeholders), broken in turn:
 * `pnpm mutate packages/media/test/core.mutations.ts` checks that a
 * test fails for every one.
 */
export default [
  {
    name: 'an Open Graph image is relative',
    edits: [
      {
        file: '../src/picture.ts',
        find: 'url => new URL(url, origin).href,',
        replace: 'url => url,',
      },
    ],
    tests: ['packages/media/test/picture.test.ts'],
  },
  {
    name: 'an Open Graph image may be AVIF',
    edits: [
      {
        file: '../src/picture.ts',
        find: "const OPEN_GRAPH_ENCODINGS = ['jpeg', 'webp', 'png'] as const",
        replace: "const OPEN_GRAPH_ENCODINGS = ['avif', 'jpeg', 'webp', 'png'] as const",
      },
    ],
    tests: ['packages/media/test/picture.test.ts'],
  },
  {
    name: 'an Open Graph image is the smallest width',
    edits: [
      {
        file: '../src/picture.ts',
        find: 'Widths.atLeast(provider.widths, 1200)',
        replace: 'provider.widths.values[0]!',
      },
    ],
    tests: ['packages/media/test/picture.test.ts'],
  },
  {
    name: 'a repeated width is accepted',
    edits: [
      {
        file: '../src/widths.ts',
        find: 'if (sorted[index] === sorted[index - 1]) {',
        replace: 'if (false) {',
      },
    ],
    tests: ['packages/media/test/layout.test.ts'],
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
    tests: ['packages/media/test/layout.test.ts'],
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
    tests: ['packages/media/test/layout.test.ts'],
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
    tests: ['packages/media/test/layout.test.ts'],
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
    tests: ['packages/media/test/layout.test.ts'],
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
    tests: ['packages/media/test/layout.test.ts'],
  },
  {
    name: 'a placeholder color may carry a declaration',
    edits: [
      {
        file: '../src/asset.ts',
        find: '[0-9a-z%.,\\s/+-]*',
        replace: '.*',
      },
    ],
    tests: ['packages/media/test/provider.test.ts'],
  },
  {
    name: 'malformed ThumbHash bytes are accepted',
    edits: [
      {
        file: '../src/asset.ts',
        find: "Schema.makeFilter(encoded => isThumbHash(encoded) || 'not a valid ThumbHash'),",
        replace: 'Schema.makeFilter(() => true),',
      },
    ],
    tests: ['packages/media/test/provider.test.ts'],
  },
  {
    name: 'an arbitrary string can name a hosted original',
    edits: [
      {
        file: '../src/asset.ts',
        find: 'hash: Schema.OptionFromNullOr(ContentHash),',
        replace: 'hash: Schema.OptionFromNullOr(Schema.String),',
      },
    ],
    tests: ['packages/media/test/provider.test.ts'],
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
    tests: ['packages/media/test/provider.test.ts'],
  },
  {
    name: 'a layout may be infinitely wide',
    edits: [
      {
        file: '../src/layout.ts',
        find: 'Schema.Finite.check',
        replace: 'Schema.Number.check',
      },
    ],
    tests: ['packages/media/test/layout.test.ts'],
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
    tests: ['packages/media/test/provider.test.ts'],
  },
  {
    name: 'any zone is accepted',
    edits: [
      {
        file: '../src/provider.ts',
        find: '!HOSTNAME.test(zone)',
        replace: 'false',
      },
    ],
    tests: ['packages/media/test/provider.test.ts'],
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
    tests: ['packages/media/test/picture.test.ts'],
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
    tests: ['packages/media/test/picture.test.ts'],
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
    tests: ['packages/media/test/picture.test.ts'],
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
    tests: ['packages/media/test/picture.test.ts'],
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
    tests: ['packages/media/test/picture.test.ts'],
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
    tests: ['packages/media/test/picture.test.ts'],
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
    tests: ['packages/media/test/picture.test.ts'],
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
    tests: ['packages/media/test/picture.test.ts'],
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
    tests: ['packages/media/test/picture.test.ts'],
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
    tests: ['packages/media/test/picture.test.ts'],
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
    tests: ['packages/media/test/picture.test.ts'],
  },
  {
    name: 'a preload drops the type',
    edits: [
      {
        file: '../src/picture.ts',
        find: 'type: Option.map(Option.fromNullishOr(first), source => source.type),',
        replace: 'type: Option.none(),',
      },
    ],
    tests: ['packages/media/test/picture.test.ts'],
  },
  {
    name: 'a preload writes values raw',
    edits: [
      {
        file: '../src/picture.ts',
        find: '${escapeAttribute(value)}',
        replace: '${value}',
      },
    ],
    tests: ['packages/media/test/picture.test.ts'],
  },
  {
    name: 'every placeholder paints its picture',
    edits: [
      {
        file: '../src/picture.ts',
        find: "(priority ? 'detail' : 'average')",
        replace: "'detail'",
      },
    ],
    tests: ['packages/media/test/picture.test.ts'],
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
    tests: ['packages/media/test/picture.test.ts'],
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
    tests: ['packages/media/test/picture.test.ts'],
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
    tests: ['packages/media/test/provider.test.ts'],
  },
]
