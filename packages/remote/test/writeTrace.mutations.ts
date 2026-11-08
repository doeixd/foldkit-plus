/**
 * #477's fix, broken: a list with no body kept on a change to another Entity,
 * as before. `pnpm mutate packages/remote/test/writeTrace.mutations.ts`.
 */
export default [
  {
    name: 'a list with no body is kept when another Entity changes',
    edits: [
      {
        file: '../src/impact.ts',
        find: '  if (body === undefined) {\n    return Impact.Invalidated',
        replace:
          '  if (body === undefined && (descriptor.Result as { readonly entity?: string }).entity !== change.entity) return kept\n  if (body === undefined) {\n    return Impact.Invalidated',
      },
    ],
    tests: ['packages/remote/test/writeTrace.test.ts', 'packages/remote/test/impact.test.ts'],
  },
]
