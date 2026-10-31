/**
 * What a page keeps of the published Entity and Remote (#378):
 * `pnpm mutate scripts/test/readOnlyPage.mutations.ts`.
 *
 * The test builds each package from the disk with tsdown, which `pnpm mutate`
 * cannot reach (its edits are a Vite plugin), so only the build configs,
 * which the test imports, are mutated here. The source was mutated by hand.
 */
const tests = ['scripts/test/readOnlyPage.test.ts']

/** Links the package's modules into its entries, so no page keeps a module of its own. */
const linked = (name: string, entries: ReadonlyArray<string>) => ({
  name: `the published ${name} links its modules into its entries`,
  edits: [
    {
      file: `../../packages/${name}/tsdown.config.ts`,
      find: "  entry: ['src/**/*.ts'],",
      replace: `  entry: ${JSON.stringify(entries)},`,
    },
  ],
  tests,
})

export default [
  linked('entity', ['src/index.ts', 'src/conformance/index.ts']),
  linked('remote', ['src/index.ts', 'src/port.ts', 'src/testing.ts']),
]
