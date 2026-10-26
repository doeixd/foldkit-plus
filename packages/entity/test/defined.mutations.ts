/**
 * A defined operator taking an implementation, broken in turn:
 * `pnpm mutate packages/entity/test/defined.mutations.ts`.
 */
export default [
  {
    name: 'memory implements a defined operator',
    edits: [
      {
        file: '../src/operators.ts',
        find: '  if (Option.isSome(operator.definedAs)) {',
        replace: '  if (false) {',
      },
    ],
    tests: ['packages/entity/test/primitive.test.ts'],
  },
  {
    name: 'SQL implements a defined operator',
    edits: [
      {
        file: '../../remote-drizzle/src/operators.ts',
        find: '    if (Option.isSome(operator.descriptor.definedAs)) {',
        replace: '    if (false) {',
      },
    ],
    tests: ['packages/remote-drizzle/test/operators.test.ts'],
  },
]
