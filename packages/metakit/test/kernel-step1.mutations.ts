/**
 * Mutations of step 1 of the kernel convergence: the property table and its
 * generated checks, each in the direction of a wrong answer:
 *   `pnpm mutate packages/metakit/test/kernel-step1.mutations.ts`
 */
const properties = '../src/properties.ts'
const propertyChecks = '../src/propertyChecks.ts'
const interval = '../src/abstract/interval.ts'
const abstractOps = '../src/abstract/ops.ts'
const residualize = '../src/ops/residualize.ts'

const propertyTests = ['packages/metakit/test/properties.test.ts']

const mutation = (
  tests: ReadonlyArray<string>,
  name: string,
  file: string,
  find: string,
  replace: string,
) => ({ name, edits: [{ file, find, replace }], tests })

const table = [
  mutation(
    propertyTests,
    'subtraction is declared commutative',
    properties,
    "'num.sub': { identity: { value: 0, side: 'right' }, monotone: ['up', 'down'] },",
    "'num.sub': { identity: { value: 0, side: 'right' }, monotone: ['up', 'down'], commutative: true },",
  ),
  mutation(
    propertyTests,
    'subtraction is declared monotone up in what it takes away',
    properties,
    "monotone: ['up', 'down'] },",
    "monotone: ['up', 'up'] },",
  ),
  mutation(
    propertyTests,
    'addition declares no direction, so the checker bounds it by nothing',
    properties,
    "'num.add': { identity: { value: 0, side: 'both' }, monotone: ['up', 'up'] },",
    "'num.add': { identity: { value: 0, side: 'both' } },",
  ),
  mutation(
    propertyTests,
    'or declares false absorbing',
    properties,
    "absorbing: { value: true, result: true, side: 'both' },",
    "absorbing: { value: false, result: false, side: 'both' },",
  ),
]

const checks = [
  mutation(
    propertyTests,
    'the identity check compares nothing',
    propertyChecks,
    "expect('identity', args, sameAnswer(run(args), x), `gives ${label(x)}`)",
    "expect('identity', args, true, `gives ${label(x)}`)",
  ),
  mutation(
    propertyTests,
    'the commutative check runs one order twice',
    propertyChecks,
    'sameAnswer(run([x, y]), run([y, x]))',
    'sameAnswer(run([x, y]), run([x, y]))',
  ),
  mutation(
    propertyTests,
    'the monotone check accepts either direction',
    propertyChecks,
    "direction === 'up' ? a <= b : a >= b,",
    'true,',
  ),
  mutation(
    propertyTests,
    'the associative check skips every grouping',
    propertyChecks,
    "associative === 'unless-refused' &&",
    'true ||',
  ),
  mutation(
    propertyTests,
    'the involution check compares once with the operand',
    propertyChecks,
    "expect('involution', [x], sameAnswer(run([run([x])]), x), 'undoes itself')",
    "expect('involution', [x], sameAnswer(run([run([x])]), run([run([x])])), 'undoes itself')",
  ),
]

const readers = [
  mutation(
    propertyTests,
    'a monotone bound takes the high end of an argument going up',
    interval,
    "(directions[index] === 'up') === (toward === -1) ? iv.lo : iv.hi",
    "(directions[index] === 'up') === (toward === 1) ? iv.lo : iv.hi",
  ),
  mutation(
    propertyTests,
    'the checker ignores the declared directions',
    abstractOps,
    'return directions === undefined ? () => Interval.top : Interval.monotone(directions, at)',
    'return () => Interval.top',
  ),
  mutation(
    propertyTests,
    'partial evaluation reads no identity',
    residualize,
    'if (laws.identity !== undefined) {',
    'if (laws.identity === undefined) {',
  ),
]

export default [...table, ...checks, ...readers]
