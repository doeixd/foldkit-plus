/**
 * The badge, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/badge.mutations.ts` checks that a test
 * fails for every one.
 */
const tests = ['packages/mixins-ui/test/badge.test.ts']

export default [
  {
    name: 'pills lose their tone attribute',
    edits: [
      {
        file: '../src/badge.ts',
        find: "...(options.tone === undefined ? [] : [h.DataAttribute('tone', options.tone)]),",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'success fills with ink instead of its tint',
    edits: [
      {
        file: '../src/recipes/badge.ts',
        find: 'background: ref[tone].subtle,',
        replace: 'background: ref[tone].ink,',
      },
    ],
    tests,
  },
]
