/**
 * Mutations of step 1 of the kernel convergence: the property table and its
 * generated checks, each in the direction of a wrong answer:
 *   `pnpm mutate packages/metakit/test/kernel-step1.mutations.ts`
 */
const properties = '../src/properties.ts'
const propertyChecks = '../src/propertyChecks.ts'
const interval = '../src/abstract/interval.ts'
const abstractOps = '../src/abstract/ops.ts'
const laws = '../src/ops/laws.ts'

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
    "'num.sub': { monotone: ['up', 'down'] },",
    "'num.sub': { monotone: ['up', 'down'], commutative: true },",
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
    "monotone: ['up', 'up'],",
    '',
  ),
  mutation(
    propertyTests,
    'or declares false absorbing',
    laws,
    "absorbing: { value: true, result: true, side: 'both', unlessRefused: true },",
    "absorbing: { value: false, result: false, side: 'both', unlessRefused: true },",
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
    'associative.unlessRefused &&',
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
    laws,
    'if (laws.identity !== undefined) {',
    'if (laws.identity === undefined) {',
  ),
]

const unportableTests = ['packages/metakit/test/unportable.test.ts']

const text = [
  mutation(
    unportableTests,
    'equality takes text holding a NUL',
    '../src/ops/eq.ts',
    '(Node.holdsNul(args) ? Node.unportable(id) : decide(args[0], args[1]))',
    'decide(args[0], args[1])',
  ),
  mutation(
    unportableTests,
    'membership takes a candidate holding a NUL',
    '../src/ops/eq.ts',
    "if (Node.holdsNul([needle, ...haystack])) return Node.unportable('eq.in')",
    "if (Node.holdsNul([needle])) return Node.unportable('eq.in')",
  ),
  mutation(
    unportableTests,
    'text is compared by UTF-16 unit',
    '../src/ops/str.ts',
    'return decide((args as ReadonlyArray<string>).map(wellFormed))',
    'return decide(args as ReadonlyArray<string>)',
  ),
  mutation(
    unportableTests,
    'a text operation takes text holding a NUL',
    '../src/ops/str.ts',
    'Node.holdsNul([value]) ? Node.unportable(id) : undefined',
    'undefined',
  ),
  mutation(
    unportableTests,
    'a path to text is a read no operation refuses',
    '../src/ops/kind.ts',
    'SchemaAST.isNumber(member) ||\n      SchemaAST.isBoolean(member) ||',
    'SchemaAST.isString(member) ||\n      SchemaAST.isNumber(member) ||\n      SchemaAST.isBoolean(member) ||',
  ),
  mutation(
    unportableTests,
    'the checker takes a text field as holding no NUL',
    '../src/abstract/values.ts',
    "info.kind === 'number' ||\n          info.kind === 'boolean' ||",
    "info.kind === 'text' ||\n          info.kind === 'number' ||\n          info.kind === 'boolean' ||",
  ),
  mutation(
    unportableTests,
    'the checker decides an operation over text that may hold a NUL',
    '../src/abstract/entail.ts',
    'if (row.unportable && !call.args.every(arg => this.portable(arg))) {',
    'if (false) {',
  ),
  mutation(
    unportableTests,
    'the checker learns nothing from a rule that took text',
    '../src/abstract/state.ts',
    'for (const arg of call.args) this.portableKeys.add(Node.key(arg))',
    '',
  ),
  mutation(
    unportableTests,
    'the solver reads no NUL into text',
    '../src/prove/lower.ts',
    'if (!abstractOps[op.id].unportable) return term',
    'return term',
  ),
  mutation(
    ['packages/metakit/test/phase1-gate.test.ts'],
    'the solver reports a witness holding a NUL it cannot replay',
    '../src/prove/solve.ts',
    "if (status === 'sat' && nul.length > 0) {",
    'if (false) {',
  ),
]

const opsTests = ['packages/metakit/test/kernel-ops.test.ts']
const parityTests = ['packages/metakit/test/sql-parity.test.ts']
const conformanceTests = ['packages/metakit/test/conformance.test.ts']

const operations = [
  mutation(
    opsTests,
    'equals answers false of a null',
    '../src/ops/eq.ts',
    "id: 'eq.equals',\n  returns: 'boolean',\n  nulls: 'strict',",
    "id: 'eq.equals',\n  returns: 'boolean',\n  nulls: 'own',",
  ),
  mutation(
    opsTests,
    'among answers false where no match sits beside a null candidate',
    '../src/ops/eq.ts',
    'return present.length < candidates.length ? null : false',
    'return false',
  ),
  mutation(
    opsTests,
    'lowerAscii lowers every letter',
    '../src/ops/str.ts',
    'text!.replace(/[A-Z]/g, letter => letter.toLowerCase())',
    'text!.toLowerCase()',
  ),
  mutation(
    opsTests,
    'trim takes every white space',
    '../src/ops/str.ts',
    'const EDGE_SPACE = /^[ \\t\\n\\r]+|[ \\t\\n\\r]+$/g',
    'const EDGE_SPACE = /^\\s+|\\s+$/g',
  ),
  mutation(
    opsTests,
    'text is ordered by UTF-16 unit',
    '../src/ops/str.ts',
    'evaluate: textual(id, ([a, b]) => holds(byCodePoint(a!, b!))),',
    'evaluate: textual(id, ([a, b]) => holds(a! < b! ? -1 : a! > b! ? 1 : 0)),',
  ),
  mutation(
    opsTests,
    'coalesce passes on a refused fallback it does not need',
    '../src/ops/null.ts',
    'evaluate: ([value, fallback]) => (value === null ? fallback : value),',
    'evaluate: ([value, fallback]) =>\n    Node.isRefusal(fallback) ? fallback : value === null ? fallback : value,',
  ),
  mutation(
    opsTests,
    'partial evaluation asks coalesce for an operand of one kind',
    laws,
    "op.returns === 'operand' ||",
    '',
  ),
  mutation(
    parityTests,
    'SQL trims no carriage return',
    '../src/sqlLowering.ts',
    'q`trim(${s}, char(32, 9, 10, 13))`',
    'q`trim(${s}, char(32, 9, 10))`',
  ),
  mutation(
    parityTests,
    'SQL answers null of a null value among nothing',
    '../src/sqlLowering.ts',
    'if (items.length === 0) return Result.succeed(q`FALSE`)',
    'if (items.length === 0) return Result.succeed(q`((${needle} IS NULL) AND NULL)`)',
  ),
  mutation(
    conformanceTests,
    'the checker takes among to have a value beside a null candidate',
    '../src/abstract/ops.ts',
    '      candidates.value.every(item => item !== null && item !== undefined),',
    '      true,',
  ),
  mutation(
    opsTests,
    'the solver takes coalesce to be null where its value is',
    '../src/prove/lower.ts',
    'isNull: z3.And(z3.Not(a!.refused), a!.isNull, b!.isNull),',
    'isNull: a!.isNull,',
  ),
  mutation(
    opsTests,
    'the solver takes among beside a null candidate to be false',
    '../src/prove/lower.ts',
    'return present.length < candidates.length\n        ?',
    'return false\n        ?',
  ),
]

const foreignTests = ['packages/metakit/test/foreign.test.ts']

const foreign = [
  mutation(
    foreignTests,
    'a foreign id may take a core prefix',
    '../src/node.ts',
    'if (reserved !== undefined) {',
    'if (false) {',
  ),
  mutation(
    foreignTests,
    'evaluation finds an implementation by id alone',
    '../src/ops/eval.ts',
    'const name = Node.foreignName(op)',
    'const name = op.id',
  ),
  mutation(
    foreignTests,
    'evaluation takes an answer of another kind',
    '../src/ops/eval.ts',
    'if (kindOfValue(result) !== op.returns) return Node.illTyped(op.id, `a ${op.returns}`, result)',
    '',
  ),
  mutation(
    foreignTests,
    'a foreign call runs over a null argument it declares strict',
    '../src/ops/eval.ts',
    'return Node.applying(op, args, values => {',
    'return ((values: ReadonlyArray<unknown>) => {',
  ),
  mutation(
    foreignTests,
    'judge answers of a foreign call it holds no implementation of as missing environment',
    '../src/ops/judge.ts',
    'Node.isForeign(op) && !Object.hasOwn(foreign, Node.foreignName(op)) ? op : unsupportedIn(args),',
    'unsupportedIn(args),',
  ),
  mutation(
    foreignTests,
    'SQL finds an entry by id alone',
    '../src/sqlRender.ts',
    'const name = Node.foreignName(op)',
    'const name = op.id',
  ),
  mutation(
    foreignTests,
    'the checker takes a foreign predicate over values to have a value',
    '../src/abstract/rowOf.ts',
    '  valued: () => false,\n  decide',
    '  decide',
  ),
  mutation(
    foreignTests,
    'a foreign call is one term whatever its version',
    '../src/node.ts',
    '(isForeign(op) ? foreignName(op) : op.id)',
    'op.id',
  ),
]

const suppliedTests = ['packages/metakit/test/supplied.test.ts']

const transitions = [
  mutation(
    suppliedTests,
    'a supplied value its Schema refuses is taken',
    '../src/transition.ts',
    '!accepts(transition.suppliedSchema.value)(given)',
    'false',
  ),
  mutation(
    suppliedTests,
    'a machine runs a message without its supplied values',
    '../src/machine.ts',
    "'supplied' in message ? message.supplied : {},",
    '{},',
  ),
  mutation(
    suppliedTests,
    'Transition.add sets the amount',
    '../src/transition.ts',
    'value: wrap(Node.Call({ op: addOp, args: [target.node, by] })),',
    'value: wrap(by),',
  ),
  mutation(
    suppliedTests,
    'an opaque step may write a path it does not declare',
    '../src/transitionOpaque.ts',
    'if (!isPlainObject(before) || !isPlainObject(after)) return Option.some(at)',
    'if (!isPlainObject(before) || !isPlainObject(after)) return Option.none()',
  ),
  mutation(
    suppliedTests,
    'a goal reads the state before as the state after',
    '../src/abstract/check.ts',
    "segments[0] === 'next'\n          ? Option.some(\n              afterWrites(",
    "segments[0] === 'next'\n          ? Option.some(\n              ((node: Node.Node, _: unknown) => node)(",
  ),
  mutation(
    suppliedTests,
    'the checker takes no rule of the supplied values',
    '../src/abstract/check.ts',
    "    ['supplied', transition.suppliedSchema],\n",
    '',
  ),
  mutation(
    suppliedTests,
    'a proof replays a step without the supplied values it found',
    '../src/prove/transition.ts',
    "const supplied = (at(env, ['supplied']) ?? {}) as Supplied",
    'const supplied = {} as Supplied',
  ),
]

const optionTests = ['packages/metakit/test/option-paths.test.ts']

const options = [
  mutation(
    optionTests,
    'evaluation reads an Option as the Option',
    '../src/path.ts',
    'Option.isOption(value) ? Option.getOrNull(value) : value',
    'value',
  ),
  mutation(
    optionTests,
    'partial evaluation takes a read through a none as unknown',
    '../src/ops/partial.ts',
    'if (current === null) return Option.some(null)',
    'if (current === null) return Option.none()',
  ),
  mutation(
    optionTests,
    'a write to an Option field stores the bare value',
    '../src/transition.ts',
    'value === null ? Option.none() : Option.some(value)',
    'value',
  ),
  mutation(
    optionTests,
    'a write of what an Option already holds makes a new state',
    '../src/transition.ts',
    'if (Object.is(Path.readable(held.value), value)) return Result.succeed(state)',
    '',
  ),
  mutation(
    optionTests,
    'a write inside an Option is taken',
    '../src/transition.ts',
    'if (inside !== -1) {',
    'if (false) {',
  ),
  mutation(
    optionTests,
    'a path to an Option of a nullable value is made',
    '../src/path.ts',
    'if (Option.exists(Option.flatMap(childAst, optionInner), admitsNull)) {',
    'if (false) {',
  ),
  mutation(
    optionTests,
    'the checker reads an Option field as the Option',
    '../src/abstract/fields.ts',
    'if (Option.isSome(inner)) {\n    collectFields(',
    'if (false) {\n    collectFields(',
  ),
]

export default [
  ...table,
  ...checks,
  ...readers,
  ...text,
  ...operations,
  ...foreign,
  ...transitions,
  ...options,
]
