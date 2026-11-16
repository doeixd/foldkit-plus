/**
 * `staticSite`'s `plan` as a function of the path, broken in turn: `pnpm mutate
 * packages/ssr/test/staticSitePlans.mutations.ts` checks that a test fails for each.
 */
const vite = '../src/vite.ts'
const tests = ['packages/ssr/test/staticSitePlans.test.ts']

export default [
  {
    name: 'every page resumes with the first plan the function gave',
    edits: [
      {
        file: vite,
        find: '? yield* Effect.try({\n              try: () => planInput(path),',
        replace: '? yield* Effect.try({\n              try: () => planInput("/"),',
      },
    ],
    tests,
  },
  {
    name: 'a plan that throws is swallowed into a plan of its own',
    edits: [
      {
        file: vite,
        find: '}).pipe(Effect.orDie)',
        replace: '}).pipe(Effect.orElseSucceed(() => planInput("/")))',
      },
    ],
    tests,
  },
  {
    name: 'the site module is loaded without the plugins it was given',
    edits: [
      {
        file: vite,
        find: '...(options.plugins === undefined ? {} : { plugins: [options.plugins] }),',
        replace: '',
      },
    ],
    tests: ['packages/ssr/test/staticSitePlugins.test.ts'],
  },
] as const
