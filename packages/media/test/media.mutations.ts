/**
 * The core, broken in turn:
 * `pnpm mutate packages/media/test/media.mutations.ts` checks that a test
 * fails for every one.
 */
const layout = ['packages/media/test/layout.test.ts']
const provider = ['packages/media/test/provider.test.ts']
const picture = ['packages/media/test/picture.test.ts']

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
]
