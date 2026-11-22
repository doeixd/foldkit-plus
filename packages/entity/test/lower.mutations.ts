/**
 * What readers do with an expression's own nodes (the builders in
 * `src/expr/*.ts`, `src/reading.ts` and `src/environment.ts`) broken step by
 * step: each mutation must be killed by the differential tests, which compare
 * the judge with metakit's evaluation (`pnpm mutate
 * packages/entity/test/lower.mutations.ts`).
 */
const compare = '../src/expr/compare.ts'
const logic = '../src/expr/logic.ts'
const text = '../src/expr/text.ts'
const operand = '../src/expr/operand.ts'
const relation = '../src/expr/relation.ts'
const primitive = '../src/expr/primitive.ts'
const arithmetic = '../src/expr/arithmetic.ts'
const textOperators = '../src/text.ts'
const env = '../src/environment.ts'
const context = '../src/context.ts'
const reading = '../src/reading.ts'
const tests = ['packages/entity/test/lower.test.ts', 'packages/entity/test/lowerKinds.test.ts']
const edit = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  // ---- comparisons and collation -------------------------------------------------
  edit('a number lt is built as lte', compare, 'lt: Ord.ltOp,', 'lt: Ord.lteOp,'),
  edit('a text lt is built as lte', compare, 'lt: Str.ltOp,', 'lt: Str.lteOp,'),
  edit(
    'a number comparison is built as a text one',
    compare,
    'onNone: () => Node.Call({ op: numberOrder[operator], args: [leftSide, rightSide] }),',
    'onNone: () => Node.Call({ op: textOrder[operator], args: [leftSide, rightSide] }),',
  ),
  edit(
    'asciiFold is dropped',
    operand,
    "    case 'AsciiFold':\n      return Node.Call({ op: Str.lowerAsciiOp, args: [node] })",
    "    case 'AsciiFold':\n      return node",
  ),
  edit(
    'contains folds no case',
    text,
    'args: [lowered(text), lowered(sought)]',
    'args: [text, sought]',
  ),
  edit(
    "startsWith drops its call's collation",
    textOperators,
    'Node.Call({ op: Str.startsWithOp, args: args.map(fold) }),',
    'Node.Call({ op: Str.startsWithOp, args }),',
  ),
  edit(
    'a primitive operator comparing text is given it unfolded',
    primitive,
    '(foldsArgument(operator, position) ? fold(arg) : arg)',
    'arg',
  ),
  // ---- null handling ---------------------------------------------------------------
  edit(
    "eq is built as the equality where null equals null, not SQL's",
    logic,
    'exprOf(call(Eq.equalsOp, [toNode(left), toNode(right)]))',
    'exprOf(call(Eq.isOp, [toNode(left), toNode(right)]))',
  ),
  edit(
    "in is built as the membership that never gives null, not SQL's",
    logic,
    'call(Eq.amongOp, [',
    'call(Eq.inOp, [',
  ),
  edit(
    'isNotNull is built as isNull',
    logic,
    'made(call(Bool.notOp, [call(Null.isNullOp, [node])]), {',
    'made(call(Null.isNullOp, [node]), {',
  ),
  edit(
    'a strict primitive operator is given nulls',
    primitive,
    "nulls: operator.nulls === 'strict' ? 'strict' : 'own',",
    "nulls: 'own',",
  ),
  // ---- logic and arithmetic --------------------------------------------------------
  edit(
    'and is built as or',
    logic,
    "export const and: Connective = connective('and', Bool.andOp)",
    "export const and: Connective = connective('and', Bool.orOp)",
  ),
  edit('not is dropped', logic, 'return exprOf(call(Bool.notOp, [node]))', 'return exprOf(node)'),
  edit(
    'sub is built as add',
    arithmetic,
    'args => Node.Call({ op: Num.subOp, args }),',
    'args => Node.Call({ op: Num.addOp, args }),',
  ),
  // ---- relations -------------------------------------------------------------------
  edit(
    "a path's hops are followed in reverse",
    relation,
    '  ...via.map(hopSegment),',
    '  ...[...via].reverse().map(hopSegment),',
  ),
  edit(
    'a path reads the row it reaches, not its field',
    relation,
    '): Node.Node => readStored([...hops(start, via), field.key], field.schema, true)',
    '): Node.Node => readStored(hops(start, via), field.schema, true)',
  ),
  edit(
    "an exists' filter reads the row asked of, not the pointing row",
    relation,
    "slice === 'row' ? fieldNode(field, 'each') : made(rebuilt(), origin)",
    "slice === 'row' ? fieldNode(field, 'row') : made(rebuilt(), origin)",
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
    context,
    "made(read(['viewer', entity.name, ASKER], Schema.String, true), {",
    "made(read(['viewer', entity.name, 'id'], Schema.String, true), {",
  ),
  // ---- foreign operations ------------------------------------------------------------
  edit(
    'an implementation is given under its id alone',
    reading,
    `          [
            name,`,
    `          [
            operator.id,`,
  ),
]
