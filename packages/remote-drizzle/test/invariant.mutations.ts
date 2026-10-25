/**
 * Invariants in the Drizzle writer, each step broken in turn:
 * `pnpm mutate packages/remote-drizzle/test/invariant.mutations.ts` checks
 * that a test fails for every one.
 */
const drizzle = '../src/index.ts'
const tests = ['packages/remote-drizzle/test/invariant.test.ts']
const edit = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit(
    'the statement does not judge the row',
    drizzle,
    'const where = and(at.where, ...(yield* holdingInvariants(values, increments)))',
    'const where = at.where',
  ),
  edit(
    'the statement judges the row before the write',
    drizzle,
    '[Expr.substitute(held.predicate, values)],',
    '[held.predicate],',
  ),
  edit(
    'an increment is judged unmoved',
    drizzle,
    'moved[field] = sql`(${binding.columns[field]} + ${amount})` as unknown as AnyColumn',
    '',
  ),
  edit(
    'a miss is never classified as invalid',
    drizzle,
    'if (Option.isSome(broken)) return yield* broken.value',
    '',
  ),
  edit('an invariant speaks before the precondition', drizzle, 'if (holdsWhen) {', 'if (true) {'),
  edit(
    'a miss judges the row without its amounts',
    drizzle,
    "typeof held === 'number' ? held + amount : held",
    'held',
  ),
  edit(
    'a miss reads no field an invariant reads',
    drizzle,
    '...invariants.flatMap(held => held.reads),',
    '',
  ),
  edit(
    'an insert is not judged',
    drizzle,
    'Option.match(refusalOf(failures), { onNone: () => Effect.void, onSome: Effect.fail }),',
    'Effect.void,',
  ),
  edit(
    'an invariant the database cannot run is found at the first write',
    drizzle,
    '    compilePredicates([held.predicate], binding, {}, invariantName(held))\n',
    '    void held\n',
  ),
  edit(
    'a binding keeps no invariant',
    '../src/bind.ts',
    'invariants: Domain.Entity.invariants(entity),',
    'invariants: [],',
  ),
  edit(
    'an insert may leave a field an invariant reads unset',
    '../../remote-server/src/index.ts',
    "if (write._tag === 'Insert') {",
    'if (false) {',
  ),
  edit(
    'a constraint passes a row its condition calls unknown',
    drizzle,
    'sql`(${condition}) is true`.inlineParams()',
    'sql`(${condition})`.inlineParams()',
  ),
  edit(
    'a constraint is sent its values as parameters',
    drizzle,
    'sql`(${condition}) is true`.inlineParams()',
    'sql`(${condition}) is true`',
  ),
  {
    ...edit(
      'a constraint holding a parameter is taken',
      drizzle,
      'if (query.params.length > 0) {',
      'if (false) {',
    ),
    survives:
      'Drizzle inlines every value the compiler passes it, so no test reaches the guard; it keeps a value Drizzle did not inline from becoming a silent `?` in a constraint',
  },
  edit(
    'a retry is answered with every field the miss read',
    drizzle,
    'Object.entries(row).filter(([key]) => answers.has(key))',
    'Object.entries(row)',
  ),
]
