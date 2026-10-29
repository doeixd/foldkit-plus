/**
 * A row keyed like an `Object.prototype` member keeps its measured height:
 * `pnpm mutate packages/primitives/test/protoKey.mutations.ts`. Each mutation
 * builds the record by assignment again.
 */
const assigned =
  '((entries: Iterable<readonly [string, number]>) => { const out: Record<string, number> = {}; for (const [key, value] of entries) out[key] = value; return out })'

export default [
  {
    name: 'restored heights are assigned into a plain object',
    edits: [
      {
        file: '../src/state/virtual.ts',
        find: 'const heights: Record<string, number> = Object.fromEntries(',
        replace: `const heights: Record<string, number> = ${assigned}(`,
      },
    ],
    tests: ['packages/primitives/test/virtual.test.ts'],
  },
  {
    name: 'pruned heights are assigned into a plain object',
    edits: [
      {
        file: '../src/state/virtual.ts',
        find: 'heights: Object.fromEntries(held)',
        replace: `heights: ${assigned}(held)`,
      },
    ],
    tests: ['packages/primitives/test/virtual.test.ts'],
  },
]
