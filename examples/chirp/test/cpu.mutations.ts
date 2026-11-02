/**
 * A call made costly, which the CPU budget must catch:
 * `pnpm mutate examples/chirp/test/cpu.mutations.ts`
 */
export default [
  {
    name: 'every request spends 30 ms more finding who asks',
    edits: [
      {
        file: '../src/server/server.ts',
        find: 'export const principalOf = (id: string): Option.Option<User> => Option.some({ id })',
        replace:
          'export const principalOf = (id: string): Option.Option<User> => {\n  for (const end = performance.now() + 30; performance.now() < end; );\n  return Option.some({ id })\n}',
      },
    ],
    tests: ['examples/chirp/test/cpu.test.ts'],
  },
]
