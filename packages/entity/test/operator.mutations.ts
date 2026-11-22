/**
 * Operators defined by an expression, each step broken in turn:
 * `pnpm mutate packages/entity/test/operator.mutations.ts` checks that a test
 * fails for every one.
 *
 * A defined call is the node its body builds, so there is no expansion to skip
 * in a compiler or an interpreter: only what the call checks and what readers
 * report of it can break.
 */
const operator = '../src/expr/operator.ts'
const dependencies = '../src/expr/dependencies.ts'
const table = '../src/expr/table.ts'
const cms = '../../cms/src/index.ts'
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
  edit(
    'a body may read what no argument holds',
    operator,
    'if (hidden.length > 0) {',
    'if (false) {',
  ),
  edit(
    'a call takes any number of arguments',
    operator,
    'if (given.length !== input.length) {',
    'if (false) {',
  ),
  edit(
    'a body of the wrong kind is kept',
    operator,
    "if (predicate !== (kindOf(expansion) === 'boolean')) {",
    'if (false) {',
  ),
  edit(
    'a predicate is taken where no boolean is',
    operator,
    'if (!takes(true) || !takes(false)) {',
    'if (false) {',
  ),
  edit(
    'a predicate needs a bare boolean input',
    operator,
    'if (!takes(true) || !takes(false)) {',
    "if (Schema.toEncoded(schema).ast._tag !== 'Boolean') {",
  ),
  edit(
    'a predicate is taken where true alone is',
    operator,
    'if (!takes(true) || !takes(false)) {',
    'if (!takes(true)) {',
  ),
  edit(
    'a value the input does not admit is taken',
    operator,
    'if (!Schema.is(Schema.toEncoded(schema))(arg.value)) {',
    'if (false) {',
  ),
  edit(
    'an argument stored as another kind is taken',
    operator,
    "if (wanted !== 'other' && given !== 'other' && given !== 'null' && given !== wanted) {",
    'if (false) {',
  ),
  edit('any id is taken', operator, 'if (!operatorId.test(id)) {', 'if (false) {'),
  edit(
    'an id under foldkit. is taken',
    operator,
    "if (id.startsWith('foldkit.')) fail(",
    'if (false) fail(',
  ),
  edit(
    'a fractional version is taken',
    operator,
    'if (!Number.isSafeInteger(version) || version < 1)',
    'if (version < 1)',
  ),
  edit(
    'dependencies leave out the operator',
    dependencies,
    'found.operators.add(origin.operator)',
    '',
  ),
  edit(
    'dependencies leave out what the expansion reads',
    dependencies,
    'onSome: expansion => walk(expansion, found),',
    'onSome: () => {},',
  ),
  edit(
    'a call prints its version always',
    table,
    'operator.version === 1 ? operator.id :',
    'false ? operator.id :',
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
