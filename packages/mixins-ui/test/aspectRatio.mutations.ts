/**
 * The aspect-ratio frame, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/aspectRatio.mutations.ts` checks that a
 * test fails for every one.
 */
const tests = ['packages/mixins-ui/test/aspectRatio.test.ts']

export default [
  {
    name: 'a video frame is square',
    edits: [
      {
        file: '../src/recipes/aspectRatio.ts',
        find: "video: { frame: variant(Style.self({ aspectRatio: '16 / 9' })) },",
        replace: "video: { frame: variant(Style.self({ aspectRatio: '1' })) },",
      },
    ],
    tests,
  },
]
