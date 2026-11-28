/**
 * `Expr.implies`, the kernel's arithmetic and the rules said with a state or
 * as a transition, each broken in turn:
 * `pnpm mutate packages/entity/test/arithmetic.mutations.ts`.
 */
const logic = '../src/expr/logic.ts'
const show = '../src/expr/show.ts'
const memory = '../src/memoryTable.ts'
const sql = '../../metakit/src/sqlLowering.ts'
const write = '../src/write.ts'
const invariant = '../src/invariant.ts'
const entityTests = [
  'packages/entity/test/arithmetic.test.ts',
  'packages/entity/test/rules.test.ts',
]
const sqlTests = [
  'packages/remote-drizzle/test/conformance.test.ts',
  'packages/remote-drizzle/test/operatorConformance.test.ts',
]
const edit = (
  name: string,
  file: string,
  find: string,
  replace: string,
  tests: ReadonlyArray<string> = entityTests,
) => ({ name, edits: [{ file, find, replace }], tests })

export default [
  edit(
    'an implication drops the negation',
    logic,
    'or(not(condition), then) as',
    'or(condition, then) as',
  ),
  edit(
    'SQL subtracts as it adds',
    sql,
    "'num.sub': exact('-'),",
    "'num.sub': exact('+'),",
    sqlTests,
  ),
  edit(
    'SQL adds the first to itself',
    sql,
    "'num.add': exact('+'),",
    "'num.add': (args, ctx) => both(args, ctx, left => q`(${left} + ${left})`),",
    sqlTests,
  ),
  edit('a sum prints as a call', show, '? infixes[node.op.id]', '? undefined'),
  edit(
    'a difference of integers is no integer',
    write,
    '(operator === add.descriptor || operator === sub.descriptor) &&',
    'false &&',
  ),
  edit(
    'a sum of anything is an integer',
    write,
    'args.every(arg => !isPredicateNode(arg) && comesToInteger(arg))',
    'true',
  ),
  edit(
    'a state binds nothing',
    invariant,
    'if (state === undefined) return predicate',
    'return predicate',
  ),
  edit(
    'a state of another Entity is taken',
    invariant,
    'if (state.entity.identity !== entity.identity)',
    'if (false)',
  ),
  edit('a state reaching another row is taken', invariant, 'if (!state.local)', 'if (false)'),
  edit(
    'a transition need not read the row before',
    invariant,
    "if (step === 'transition' && beforeReads.length === 0) {",
    'if (false) {',
  ),
  edit(
    'the guard is left out of what a rule reads after',
    invariant,
    'const afterReads = dependenciesOf(predicate).next.map(field => field.key)',
    'const afterReads = dependencies.next.map(field => field.key)',
  ),
]
