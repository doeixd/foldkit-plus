/**
 * A client given no build id, broken: `pnpm mutate packages/ssr/test/buildId.mutations.ts`.
 */
export default [
  {
    name: 'a client given no build id adopts the baseline in silence',
    edits: [
      {
        file: '../src/client.ts',
        find: "if (typeof options.buildId !== 'string') {",
        replace: 'if (false) {',
      },
    ],
    tests: ['packages/ssr/test/noBuildId.test.ts'],
  },
]
