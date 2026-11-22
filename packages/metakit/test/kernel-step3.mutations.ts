/**
 * Step 3 of the unification plan, broken in turn: the `Rows` node in every
 * reader, the list operations and ways of writing, the fold and write
 * property tables, and each rule of `Transition.commutes`:
 *   `pnpm mutate packages/metakit/test/kernel-step3.mutations.ts`
 */
const commutes = '../src/transitionCommutes.ts'
const rows = '../src/ops/rows.ts'
const residual = '../src/ops/partialRows.ts'
const reads = '../src/ops/reads.ts'
const lowering = '../src/sqlLowering.ts'
const render = '../src/sqlRender.ts'
const relation = '../src/relation.ts'
const arr = '../src/ops/arr.ts'
const lists = '../src/transitionLists.ts'
const transition = '../src/transition.ts'
const abstractLists = '../src/abstract/lists.ts'
const path = '../src/path.ts'
const properties = '../src/properties.ts'

const rowsTests = ['packages/metakit/test/rows.test.ts']
const transitionTests = ['packages/metakit/test/transition-lists.test.ts']
const propertyTests = ['packages/metakit/test/properties-rows.test.ts']
const parityTests = ['packages/metakit/test/sql-parity-rows.test.ts']

const mutation = (
  tests: ReadonlyArray<string>,
  name: string,
  file: string,
  find: string,
  replace: string,
) => ({ name, edits: [{ file, find, replace }], tests })

export default [
  // Transition.commutes, rule by rule.
  mutation(
    transitionTests,
    'rule 1: a term that may read anything is taken to read nothing',
    commutes,
    'if (readingNodes(transition).some(node => Option.isNone(readsOfNode(node)))) {',
    'if (false) {',
  ),
  mutation(
    transitionTests,
    'rule 3: a write meeting the other’s read decides nothing',
    commutes,
    'const met = meetsAny(stateReads(reader), writer.writes.flatMap(writtenPaths))',
    'const met = undefined',
  ),
  mutation(
    transitionTests,
    'rule 3: a way’s own reads are judged as any read',
    commutes,
    '    ...transition.writes.flatMap(ownReadsLeft),',
    '    ...transition.writes.flatMap(write => readsOf([write.value.node])),',
  ),
  mutation(
    [...transitionTests, ...propertyTests],
    'rule 4: any two ways that meet commute',
    commutes,
    'if (!same || condition === undefined || !holds(condition, x, wa, y, wb)) {',
    'if (false) {',
  ),
  mutation(
    transitionTests,
    'rule 4: two sets commute whatever their values',
    commutes,
    'return Option.exists(literals(wa, wb), ([x, y]) => sameAnswer(x, y))',
    'return true',
  ),
  mutation(
    transitionTests,
    'rule 4: an include and an exclude commute whatever their values',
    commutes,
    'return Option.exists(literals(wa, wb), ([x, y]) => !sameAnswer(x, y))',
    'return true',
  ),
  mutation(
    transitionTests,
    'rule 4: two patches commute though one reads a field the other sets',
    commutes,
    '!touches(elementFieldsRead(wa), setB) &&',
    '',
  ),
  mutation(
    transitionTests,
    'rule 4: a removal commutes with a patch of the field it tests',
    commutes,
    'return !touches(elementFieldsRead(removal), fieldsSet(changed))',
    'return true',
  ),
  mutation(
    transitionTests,
    'rule 5: two adds commute whatever the totals they pass through',
    commutes,
    'return inRange(a, wa, b, wb)',
    'return true',
  ),
  mutation(
    transitionTests,
    'rule 5: a fraction is taken for an integer',
    commutes,
    'return info !== undefined && info.isInt ? Option.some(info.interval) : Option.none()',
    "return info !== undefined && info.kind === 'number' ? Option.some(Interval.between(-1, 1)) : Option.none()",
  ),
  mutation(
    [...transitionTests, ...propertyTests],
    'num.add is not commutative, so no two adds commute',
    properties,
    '    commutative: true,\n    associative: { over: ',
    '    associative: { over: ',
  ),

  // Evaluation of a fold.
  mutation(
    rowsTests,
    'any is refused where another element refused, though one passes',
    rows,
    'else if (passed === decisive) return decisive',
    'else if (passed === decisive && refused === undefined) return decisive',
  ),
  mutation(
    rowsTests,
    'keep gives a new list where every element passes',
    rows,
    'return kept.length === elements.length ? elements : kept',
    'return kept',
  ),
  mutation(
    transitionTests,
    'patch gives a new list where no element has the key',
    rows,
    'return changed ? out : elements',
    'return out',
  ),
  mutation(
    rowsTests,
    'an integer total is summed as doubles, refused on the way',
    rows,
    'if (values.every(Number.isSafeInteger)) {',
    'if (values.every(Number.isSafeInteger) && values.length > 99) {',
  ),
  mutation(
    rowsTests,
    'evaluation folds related rows held only in part',
    '../src/ops/rowsLoad.ts',
    '      whole\n        ? foldAnswers(',
    '      true\n        ? foldAnswers(',
  ),

  // Partial evaluation.
  mutation(
    rowsTests,
    'judge decides nothing early, from a held answer',
    residual,
    'tests.some(test => Option.exists(known(test), answer => passing(answer) === value))',
    'false',
  ),
  mutation(
    rowsTests,
    'judge takes some related rows for all of them',
    residual,
    'if (whole && answers.every(each => Option.isSome(reader.known(each)))) {',
    'if (answers.every(each => Option.isSome(reader.known(each)))) {',
  ),

  // What a fold reads.
  mutation(
    rowsTests,
    'a body’s read of its element reads the list, not each element',
    reads,
    "? bases.map(base => [...base, '*', ...segments.slice(1)])",
    '? bases',
  ),
  mutation(
    rowsTests,
    'a `*` segment matches no other segment',
    path,
    'a === b || a === EVERY || b === EVERY',
    'a === b',
  ),

  // SQL.
  mutation(
    rowsTests,
    'a list in a column is not refused by name',
    lowering,
    'a list held in a column is not lowered to SQL',
    'unsupported',
  ),
  mutation(
    parityTests,
    'every lets a row whose test is null pass',
    render,
    "text(') IS TRUE))'),",
    "text(') IS NOT FALSE))'),",
  ),
  mutation(
    parityTests,
    'a related row passes on a test that is null',
    render,
    "onSome: test => [text(' AND ('), test, text(') IS TRUE')],",
    "onSome: test => [text(' AND ('), test, text(') IS NOT FALSE')],",
  ),

  // Building a body.
  mutation(
    rowsTests,
    'a body over related rows may read the row it is asked of',
    relation,
    'const own = reads.find(segments => slice !== undefined && segments[0] === slice)',
    'const own = undefined',
  ),
  mutation(rowsTests, 'a body may hold a second Rows', arr, '  refuse(node)\n', '\n'),

  // The list operations.
  mutation(
    rowsTests,
    'include adds a value at the end, not at its place',
    arr,
    'if (sign > 0 && at === list.length) at = index',
    '',
  ),
  mutation(
    [...rowsTests, ...transitionTests],
    'append stores null into an Option field',
    arr,
    'return [name, option ? Option.fromNullOr(value) : value] as const',
    'return [name, value] as const',
  ),

  // The ways of writing.
  mutation(
    transitionTests,
    'insert appends a key already there',
    lists,
    'Node.If({ cond: present, then: list.node, otherwise: made.node }),',
    'made.node,',
  ),
  mutation(
    transitionTests,
    'remove keeps the elements with the key',
    lists,
    'where: Node.Call({ op: isNotOp, args: [keyOf(key), by] })',
    'where: Node.Call({ op: isOp, args: [keyOf(key), by] })',
  ),
  mutation(
    transitionTests,
    'removeWhere removes an element whose test is null',
    lists,
    'where: Node.Call({ op: isNotOp, args: [passes, Node.Lit({ value: true })] }),',
    'where: Node.Call({ op: isOp, args: [passes, Node.Lit({ value: false })] }),',
  ),
  mutation(
    transitionTests,
    'a patch is declared to write the whole list',
    transition,
    '? way.set.map(([field]) => [...target, Path.EVERY, field])',
    '? [target]',
  ),
  mutation(
    transitionTests,
    'an entry is emitted whatever its condition',
    transition,
    'const fires = Option.match(entry.when, { onNone: () => true, onSome: valueOf })',
    'const fires = true',
  ),

  // What the checker knows of a list's length.
  mutation(
    rowsTests,
    'the elements that pass may be more than the list holds',
    abstractLists,
    "above: 0, kind: 'passing' as const",
    "above: 1, kind: 'passing' as const",
  ),
  mutation(
    rowsTests,
    'an append adds two',
    abstractLists,
    'args: [countOf(list.args[0]!), Node.Lit({ value: 1 })]',
    'args: [countOf(list.args[0]!), Node.Lit({ value: 2 })]',
  ),

  // The fold properties a reader decides from.
  mutation(
    [...rowsTests, ...propertyTests],
    'count is declared monotone down',
    properties,
    "count: { ...summed('integers'), monotone: 'up' },",
    "count: { ...summed('integers'), monotone: 'down' },",
  ),
]
