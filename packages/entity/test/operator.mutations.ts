/**
 * Operators defined by an expression, each step broken in turn:
 * `pnpm mutate packages/entity/test/operator.mutations.ts` checks that a test
 * fails for every one.
 */
const expr = '../src/expr.ts'
const evaluate = '../src/evaluate.ts'
const compile = '../../remote-drizzle/src/compile.ts'
const cms = '../../cms/src/index.ts'
const tanstack = '../../../examples/tanstack/src/interpreter.ts'
const tests = [
  'packages/entity/test/operator.test.ts',
  'packages/remote-drizzle/test/compile.test.ts',
  'packages/cms/test/cms.test.ts',
  'packages/guard/test/write.test.ts',
  'examples/tanstack/test/conformance.test.ts',
]
const edit = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit('a body may read what no argument holds', expr, 'if (hidden.length > 0) {', 'if (false) {'),
  edit(
    'a call takes any number of arguments',
    expr,
    'if (given.length !== input.length) {',
    'if (false) {',
  ),
  edit(
    'a body of the wrong kind is kept',
    expr,
    'if (predicate !== isPredicate(expansion)) {',
    'if (false) {',
  ),
  edit(
    'a predicate is taken where no boolean is',
    expr,
    "if (!storedAsBoolean(schema)) fail('is a predicate",
    "if (false) fail('is a predicate",
  ),
  edit(
    'a value the input does not admit is taken',
    expr,
    'if (!Schema.is(Schema.toEncoded(schema))(arg.value)) {',
    'if (false) {',
  ),
  edit(
    'an argument stored as another kind is taken',
    expr,
    "if (wanted !== 'other' && given !== 'other' && given !== wanted) {",
    'if (false) {',
  ),
  edit('any id is taken', expr, 'if (!operatorId.test(id)) {', 'if (false) {'),
  edit(
    'an id under foldkit. is taken',
    expr,
    "if (id.startsWith('foldkit.')) fail(",
    'if (false) fail(',
  ),
  edit(
    'a fractional version is taken',
    expr,
    'if (!Number.isSafeInteger(version) || version < 1)',
    'if (version < 1)',
  ),
  edit('dependencies leave out the operator', expr, 'found.operators.add(expr.operator)', ''),
  edit(
    'dependencies leave out what the expansion reads',
    expr,
    'onSome: expansion => walk(expansion, found),',
    'onSome: () => {},',
  ),
  edit(
    'ownership skips a call’s arguments',
    expr,
    'for (const arg of expr.args) yield* fieldsIn(arg, seen)',
    '',
  ),
  edit(
    'the budget counts a call as its arguments',
    expr,
    'onSome: expansion => [expansion],',
    'onSome: () => expr.args,',
  ),
  edit(
    'a call prints its version always',
    expr,
    'operator.version === 1 ? operator.id :',
    'false ? operator.id :',
  ),
  edit(
    'a call of a predicate operator always holds',
    evaluate,
    'return truthOf(node, called(node, scope))',
    'return true',
  ),
  edit(
    'a call of a scalar operator is null',
    evaluate,
    'return called(node, scope)',
    'return null',
  ),
  edit(
    'expanding keeps a predicate call',
    expr,
    'onSome: expandedPredicate,',
    'onSome: () => test,',
  ),
  edit('expanding keeps a scalar call', expr, 'onSome: expandedScalar,', 'onSome: () => scalar,'),
  edit(
    'a field after a write under a call is not substituted',
    expr,
    'expansion: Option.map(predicate.expansion, expansion => substituted(expansion, rewrite)),',
    'expansion: predicate.expansion,',
  ),
  edit(
    'the compiler compiles a call as written',
    compile,
    'predicates.map(node => predicate(Expr.expanded(node), target, input, query))',
    'predicates.map(node => predicate(node, target, input, query))',
  ),
  edit(
    'the TanStack interpreter runs a call as written',
    tanstack,
    'const node = Expr.expanded(written)',
    'const node = written',
  ),
  // None for LiveStore's expansion: its suite picks the cases it runs by compiling
  // them, so dropping it moves a case between lists rather than failing one, which
  // the runner rightly reads as invalid. Its own test ('A defined operator') holds it.
  edit(
    'published means its role holds no value',
    cms,
    'definedAs: publishedAt => Expr.isNotNull(publishedAt),',
    'definedAs: publishedAt => Expr.isNull(publishedAt),',
  ),
  edit(
    'an Entity with no published role is taken',
    cms,
    'if (field === undefined) {',
    'if (false) {',
  ),
]
