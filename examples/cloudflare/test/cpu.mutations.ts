/**
 * A route made costly, which the CPU budget must catch:
 * `pnpm mutate examples/cloudflare/test/cpu.mutations.ts`
 */
export default [
  {
    name: 'every Remote request spends 50 ms more',
    edits: [
      {
        file: '../src/worker.ts',
        find: 'const actorOf = (request: Request): string => {',
        replace:
          'const actorOf = (request: Request): string => {\n  for (const end = performance.now() + 50; performance.now() < end; );',
      },
    ],
    tests: ['examples/cloudflare/test/cpu.test.ts'],
  },
]
