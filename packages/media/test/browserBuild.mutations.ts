/**
 * The package's build, broken: `pnpm mutate packages/media/test/browserBuild.mutations.ts`.
 */
export default [
  {
    name: 'the package builds for Node, whose runtime chunk imports node:module',
    edits: [{ file: '../tsdown.config.ts', find: "platform: 'neutral',", replace: '' }],
    tests: ['packages/media/test/browserBuild.test.ts'],
  },
]
