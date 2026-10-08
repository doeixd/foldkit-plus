/**
 * Set type, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/typography.mutations.ts` checks that
 * a test fails for every one.
 */
const tests = ['packages/mixins-ui/test/typography.test.ts']

export default [
  {
    name: 'headings all read as h1',
    edits: [
      {
        file: '../src/typography.ts',
        find: "    case 'h2':\n      return h.h2(attrs, [options.text])",
        replace: "    case 'h2':\n      return h.h1(attrs, [options.text])",
      },
    ],
    tests,
  },
  {
    name: 'muted text reads overt',
    edits: [
      {
        file: '../src/recipes/typography.ts',
        find: 'text: variant(Style.self({ fontSize: ref.size.sm, color: ref.text.muted })),',
        replace: 'text: variant(Style.self({ fontSize: ref.size.sm, color: ref.text.overt })),',
      },
    ],
    tests,
  },
]
