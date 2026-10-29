/**
 * Each package's build, linked again:
 * `pnpm mutate scripts/test/publishedBuild.mutations.ts`.
 */
const tests = ['scripts/test/publishedBuild.test.ts']

const config = (name: string) => `../../packages/${name}/tsdown.config.ts`

/** Builds from the entries the package exports, as before, linking every module into them. */
const linked = (name: string, entries: ReadonlyArray<string>) => ({
  name: `the published ${name} links its modules into its entries`,
  edits: [
    {
      file: config(name),
      find: "  entry: ['src/**/*.ts'],",
      replace: `  entry: ${JSON.stringify(entries)},`,
    },
  ],
  tests,
})

/** Links relative imports, so `export * as` becomes an object again. */
const namespacesLinked = (name: string) => ({
  name: `the published ${name} links its namespaces into objects`,
  edits: [{ file: config(name), find: '/^\\.\\.?\\//, ', replace: '' }],
  tests,
})

export default [
  linked('entity', ['src/index.ts', 'src/conformance/index.ts']),
  linked('crud', ['src/index.ts']),
  linked('form', ['src/index.ts']),
  linked('ssr', ['src/index.ts', 'src/client.ts', 'src/vite.ts']),
  linked('remote', ['src/index.ts', 'src/port.ts', 'src/testing.ts']),
  ...['mixins', 'bundle', 'media', 'primitives'].map(namespacesLinked),
]
