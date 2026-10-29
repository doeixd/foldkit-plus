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

/** Restores the linked build of a package that also leaves relative imports as written. */
const relinked = (name: string, entries: ReadonlyArray<string>) => {
  const mutation = linked(name, entries)
  return {
    ...mutation,
    edits: [...mutation.edits, { file: config(name), find: '/^\\.\\.?\\//', replace: '/^$/' }],
  }
}

export default [
  linked('entity', ['src/index.ts', 'src/conformance/index.ts']),
  linked('crud', ['src/index.ts']),
  linked('form', ['src/index.ts']),
  linked('ssr', ['src/index.ts', 'src/client.ts', 'src/vite.ts']),
  linked('remote', ['src/index.ts', 'src/port.ts', 'src/testing.ts']),
  ...['mixins', 'bundle', 'media', 'primitives'].map(namespacesLinked),
  ...[
    'surface',
    'builder',
    'mixins-builder',
    'mixins-data-grid',
    'mixins-richtext',
    'mixins-surface',
    'react',
    'remote-drizzle',
    'richtext',
    'richtext-markdown',
  ].map(name => relinked(name, ['src/index.ts'])),
  relinked('composition', [
    'src/index.ts',
    'src/foldkit/index.ts',
    'src/richtext/index.ts',
    'src/appearance/index.ts',
    'src/remote/index.ts',
    'src/surface/index.ts',
  ]),
  relinked('data-grid', ['src/index.ts', 'src/crud.ts']),
  relinked('durable', ['src/index.ts', 'src/core.ts']),
  relinked('mixins-crud', ['src/index.ts', 'src/recipes.ts']),
  relinked('sync', [
    'src/index.ts',
    'src/journal.ts',
    'src/entity.ts',
    'src/do.ts',
    'src/remote.ts',
  ]),
]
