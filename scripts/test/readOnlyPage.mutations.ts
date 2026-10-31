/**
 * What a page keeps of the published Entity and Remote (#378):
 * `pnpm mutate scripts/test/readOnlyPage.mutations.ts`.
 *
 * The test builds each package from the disk with tsdown, which `pnpm mutate`
 * cannot reach (its edits are a Vite plugin), so only the build configs,
 * which the test imports, are mutated here. Entity's source was mutated by
 * hand: `defineVariants` reading its invariants (`invariantsOf(entity)`)
 * before it returns, and `Entity` an object again, each failed "keeps no
 * invariant judge, expressions or writes". Remote's likewise: a domain that
 * carries `why` again (`Object.assign(domain, { why })` in `bindDomain`)
 * failed "keeps no explanations", and one that reaches `outboxStatus` and
 * `persistence` again failed "keeps no outbox or persistence code".
 */
const tests = ['scripts/test/readOnlyPage.test.ts']

const config = (name: string) => `../../packages/${name}/tsdown.config.ts`

/** Entity's relative imports, left as written so `export * as Entity` stays a namespace. */
const relative = { file: config('entity'), find: '/^\\.\\.?\\//, ', replace: '' }

/** Links the package's modules into its entries, so no page keeps a module of its own. */
const linked = (name: string, entries: ReadonlyArray<string>) => ({
  name: `the published ${name} links its modules into its entries`,
  edits: [
    {
      file: config(name),
      find: "  entry: ['src/**/*.ts'],",
      replace: `  entry: ${JSON.stringify(entries)},`,
    },
    ...(name === 'entity' ? [relative] : []),
  ],
  tests,
})

export default [
  linked('entity', ['src/index.ts', 'src/conformance/index.ts']),
  {
    name: 'the published entity links its namespace into an object',
    edits: [relative],
    tests,
  },
  linked('remote', [
    'src/index.ts',
    'src/filter.ts',
    'src/outbox.ts',
    'src/overlay.ts',
    'src/persistence.ts',
    'src/port.ts',
    'src/testing.ts',
    'src/why.ts',
  ]),
]
