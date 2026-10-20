/**
 * The third-party provider, broken in turn:
 * `pnpm mutate packages/media/test/unpic.mutations.ts` checks that a test
 * fails for every one.
 */
const provider = '../src/unpic/index.ts'
const tests = ['packages/media/test/unpic.test.ts']

export default [
  {
    name: 'an image on another host is written for this one',
    edits: [
      {
        file: provider,
        find: 'if (getProviderForUrl(asset.key) !== cdn) return Option.none()',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a format the host ignores is offered as a source',
    edits: [
      {
        file: provider,
        find: "if (encoding !== 'auto' && !takesFormat) return Option.none()",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'the quality is not passed on',
    edits: [{ file: provider, find: '      ...quality,\n', replace: '' }],
    tests,
  },
  {
    name: 'a source is offered unasked',
    edits: [
      {
        file: provider,
        find: 'sources: options.sources ?? [],',
        replace: "sources: options.sources ?? ['avif'],",
      },
    ],
    tests,
  },
  {
    name: 'the img asks for a format of its own',
    edits: [
      {
        file: provider,
        find: "fallback: options.fallback ?? 'auto',",
        replace: "fallback: options.fallback ?? 'webp',",
      },
    ],
    tests,
  },
]
