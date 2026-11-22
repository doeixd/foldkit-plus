/**
 * The translation (`src/lower.ts`) broken step by step: each mutation must be
 * killed by the differential tests, which compare it with today's judge
 * (`pnpm mutate packages/entity/test/lower.mutations.ts`).
 */
const lower = '../src/lower.ts'
const operator = '../src/lowerOperator.ts'
const env = '../src/lowerEnv.ts'
const tests = ['packages/entity/test/lower.test.ts', 'packages/entity/test/lowerKinds.test.ts']
const edit = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  // ---- comparisons and collation -------------------------------------------------
  edit('a number lt is translated as lte', lower, 'lt: Ord.ltOp,', 'lt: Ord.lteOp,'),
  edit('a text lt is translated as lte', lower, 'lt: Str.ltOp,', 'lt: Str.lteOp,'),
  edit(
    'a number comparison is translated as a text one',
    lower,
    'onNone: () => callOf(numberOrder[operator], [lower(left), lower(right)]),',
    'onNone: () => callOf(textOrder[operator], [lower(left), lower(right)]),',
  ),
  edit(
    'asciiFold is dropped',
    operator,
    'AsciiFold: () => Node.Call({ op: Str.lowerAsciiOp, args: [node] }),',
    'AsciiFold: () => node,',
  ),
  edit(
    'contains folds no case',
    lower,
    'callOf(Str.lowerAsciiOp, [lower(value)]),',
    'lower(value),',
  ),
  edit(
    "startsWith drops its call's collation",
    operator,
    'Node.Call({ op: Str.startsWithOp, args: args.map(fold) }),',
    'Node.Call({ op: Str.startsWithOp, args }),',
  ),
  edit(
    'a primitive operator comparing text is given it unfolded',
    operator,
    '(foldsArgument(operator, position) ? fold(arg) : arg)',
    'arg',
  ),
  // ---- null handling ---------------------------------------------------------------
  edit(
    "eq is translated as the equality where null equals null, not SQL's",
    lower,
    'callOf(Eq.equalsOp, [lower(left), lower(right)])',
    'callOf(Eq.isOp, [lower(left), lower(right)])',
  ),
  edit(
    "in is translated as the membership that never gives null, not SQL's",
    lower,
    'callOf(Eq.amongOp, [lower(value), lower(among)])',
    'callOf(Eq.inOp, [lower(value), lower(among)])',
  ),
  edit(
    'isNotNull is translated as isNull',
    lower,
    'return present ? callOf(Bool.notOp, [absent]) : absent',
    'return present ? absent : callOf(Bool.notOp, [absent])',
  ),
  edit(
    'a strict primitive operator is given nulls',
    operator,
    "nulls: operator.nulls === 'strict' ? 'strict' : 'own',",
    "nulls: 'own',",
  ),
  // ---- logic and arithmetic --------------------------------------------------------
  edit(
    'and is translated as or',
    lower,
    'And: ({ operands }) => joined(Bool.andOp, operands.map(lower)),',
    'And: ({ operands }) => joined(Bool.orOp, operands.map(lower)),',
  ),
  edit(
    'not is dropped',
    lower,
    'Not: ({ operand }) => callOf(Bool.notOp, [lower(operand)]),',
    'Not: ({ operand }) => lower(operand),',
  ),
  edit(
    'sub is translated as add',
    operator,
    '[Expr.sub.descriptor, args => Node.Call({ op: Num.subOp, args })],',
    '[Expr.sub.descriptor, args => Node.Call({ op: Num.addOp, args })],',
  ),
  // ---- relations -------------------------------------------------------------------
  edit(
    "a path's hops are followed in reverse",
    lower,
    '...via.map(hopSegment),',
    '...[...via].reverse().map(hopSegment),',
  ),
  edit(
    'a path reads the row it reaches, not its field',
    lower,
    '[...hops([scope.slice], path.via), path.field.key]',
    'hops([scope.slice], path.via)',
  ),
  edit(
    "an exists' filter reads the row asked of, not the pointing row",
    lower,
    "lowerNode(where, { ...scope, slice: 'each' })",
    "lowerNode(where, { ...scope, slice: 'row' })",
  ),
  // ---- the environment -------------------------------------------------------------
  edit(
    'the pointing rows a holder has are taken for all of them',
    env,
    'whole: Option.isNone(missing),',
    'whole: true,',
  ),
  edit(
    'a viewer of another Entity reads as one of this',
    env,
    'Option.filter(context.viewer, ref => ref.entity === name),',
    'context.viewer,',
  ),
  edit(
    "a viewer's row the reader may not see reads its id everywhere",
    env,
    'for (const key of fields.keys()) put(hidden, key, null)',
    'for (const key of fields.keys()) put(hidden, key, id)',
  ),
  edit(
    "a viewer's row the reader may not see reads its own id, as who asks",
    env,
    'for (const key of fields.keys()) put(hidden, key, null)',
    "for (const key of fields.keys()) put(hidden, key, key === 'id' ? id : null)",
  ),
  edit(
    'who asks is not known where their row is hidden',
    env,
    'const hidden: Record<string, unknown> = { ...asker }',
    'const hidden: Record<string, unknown> = {}',
  ),
  edit(
    'the viewer is read as their row’s id, not as who asks',
    lower,
    "return read(['viewer', entity.name, ASKER], viewer.schema, true)",
    "return read(['viewer', entity.name, 'id'], viewer.schema, true)",
  ),
  // ---- foreign operations ------------------------------------------------------------
  edit(
    'an implementation is given under its id alone',
    operator,
    `          [
            name,`,
    `          [
            operator.id,`,
  ),
]
