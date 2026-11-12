/**
 * `step`, the data-last form of every operator and comparison, broken in turn:
 * `pnpm mutate packages/entity/test/step.mutations.ts` checks that a test fails
 * for each.
 *
 * The type side (`step.test-d.ts`) is mutated by hand, since `pnpm mutate` runs
 * Vitest and Vitest does not typecheck. Each of these, applied to
 * `packages/entity/src/expr.ts` and checked with `npx tsc -b packages/entity`
 * (2026-11-10), made the compile fail where a `@ts-expect-error` or a
 * `toEqualTypeOf` stopped holding, and was restored from a copy:
 *
 * - `Expr.eq.step`'s subject loses `& Fits<R, EqRight<L>, ...>`: 4 errors;
 * - `CompareStep`'s subject loses its `Fits`: 3 errors;
 * - `InStep`'s subject loses its `Fits`: 3 errors;
 * - `ContainsStep`'s `const S extends ContainsSearch` loses its constraint: 2 errors;
 * - `EqStep`'s result drops `ReadsOf<R>`: 1 error;
 * - `OperatorStep`'s `Self` loses its constraint: 2 errors.
 */
const expr = '../src/expr.ts'
const tests = ['packages/entity/test/step.test.ts']
const edit = (name: string, find: string, replace: string) => ({
  name,
  edits: [{ file: expr, find, replace }],
  tests,
})

export default [
  edit('an operator step drops its subject', 'call(self, ...rest)', 'call(...rest)'),
  edit('an operator step puts its subject last', 'call(self, ...rest)', 'call(...rest, self)'),
  edit(
    'a comparison step puts its value on the left',
    'left => compare(left, right as never, options)',
    'left => compare(right as never, left as never, options)',
  ),
  edit(
    'a comparison step drops its options',
    'left => compare(left, right as never, options)',
    'left => compare(left, right as never)',
  ),
  edit(
    'eq.step puts its value on the left',
    'eqCall(left as never, right as never)',
    'eqCall(right as never, left as never)',
  ),
  edit(
    'contains.step builds the node itself, skipping the search check',
    'containsCall(value, search)) as ContainsStep',
    "node({ _tag: 'Contains', value: toExpr(value, 'contains'), search: toOperand(search as never) } as never)) as ContainsStep",
  ),
  edit(
    'contains.step searches for the text in the search',
    'containsCall(value, search)) as ContainsStep',
    'containsCall(search as never, value as never)) as ContainsStep',
  ),
  edit(
    'in.step puts the list on the left',
    'inCall(value, among as never)) as InStep',
    'inCall(among as never, value as never)) as InStep',
  ),
]
