/**
 * The skeleton, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/skeleton.mutations.ts` checks that a
 * test fails for every one.
 */
const tests = ['packages/mixins-ui/test/skeleton.test.ts']

export default [
  {
    name: 'every bar interrupts',
    edits: [
      {
        file: '../src/skeleton.ts',
        find: "h.Role('status')",
        replace: "h.Role('alert')",
      },
    ],
    tests,
  },
  {
    name: 'circles come out square',
    edits: [
      {
        file: '../src/recipes/skeleton.ts',
        find: "bar: variant(\n          Style.self({ inlineSize: '2.5rem', blockSize: '2.5rem', borderRadius: ref.radius.full }),",
        replace:
          "bar: variant(\n          Style.self({ inlineSize: '2.5rem', blockSize: '2.5rem', borderRadius: ref.radius.sm }),",
      },
    ],
    tests,
  },
]
