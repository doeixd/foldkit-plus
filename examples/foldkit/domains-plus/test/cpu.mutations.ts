/**
 * Routes made costly, which the CPU budgets must catch:
 * `pnpm mutate examples/foldkit/domains-plus/test/cpu.mutations.ts`
 */
const tests = ['examples/foldkit/domains-plus/test/cpu.test.ts']

export default [
  {
    name: "a read builds each label's whole catalog (before e33c3d79)",
    edits: [
      {
        file: '../src/server/remote.ts',
        find: "import { makeDemoDomain } from '../shared/demoDomains'",
        replace: "import { makeDemoDomain, makeDemoDomains } from '../shared/demoDomains'",
      },
      {
        file: '../src/server/remote.ts',
        find: 'rowOf(makeDemoDomain(label, tld))',
        replace: 'rowOf(makeDemoDomains(label).find(domain => domain.name === id)!)',
      },
    ],
    tests,
  },
  {
    name: 'every page spends a second more',
    edits: [
      {
        file: '../src/server/entry.ts',
        find: 'const readPage = (model: Model, request: Request): Effect.Effect<Model> => {',
        replace:
          'const readPage = (model: Model, request: Request): Effect.Effect<Model> => {\n  for (const end = performance.now() + 1000; performance.now() < end; );',
      },
    ],
    tests,
  },
  {
    name: 'no page is kept, so each is rendered again',
    edits: [
      {
        file: '../src/server/entry.ts',
        find: '    ...kept,\n    buildId:',
        replace: '    diagnostics: kept.diagnostics,\n    buildId:',
      },
    ],
    tests,
  },
]
