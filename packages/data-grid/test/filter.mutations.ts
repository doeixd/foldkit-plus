/**
 * The column filters' rules, broken in turn:
 * `pnpm mutate packages/data-grid/test/filter.mutations.ts` checks that a test
 * fails for every one.
 */
const tests = ['packages/data-grid/test/filter.test.ts']
const at = (file: string) => (name: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})
const columns = at('../src/columns.ts')
const filter = at('../src/filter.ts')
const grid = at('../src/grid.ts')

export default [
  columns(
    'a boolean is no checkbox',
    '  if (isBooleanLike(type)) return CellEditor.Checkbox()\n',
    '',
  ),
  columns(
    'a union with a text literal is a choice',
    'return options.length === ast.types.length ? Option.some(options) : Option.none()',
    'return options.length > 0 ? Option.some(options) : Option.none()',
  ),
  columns(
    'number literals are text',
    "  (SchemaAST.isLiteral(ast) && typeof ast.literal === 'number') ||\n",
    '',
  ),
  columns(
    'a filter reads its choice from the text side',
    '  return classify(type, type)',
    '  return classify(type, SchemaAST.toEncoded(schema.ast))',
  ),
  filter(
    'empty text is stored',
    "Schema.TaggedStruct('Contains', { text: Schema.String.check(Schema.isMinLength(1)) })",
    "Schema.TaggedStruct('Contains', { text: Schema.String })",
  ),
  filter('a range of no bound is stored', '    Option.isSome(a) || Option.isSome(b)', '    true'),
  filter(
    'a choice stores any text',
    'options: Schema.Array(Schema.Literals(options)).check(',
    'options: Schema.Array(Schema.String).check(',
  ),
  filter('a choice stores an option twice', '          Schema.isUnique(),\n', ''),
  filter(
    'any text is a bound',
    'const decimal = /^[+-]?(\\d+(\\.\\d*)?|\\.\\d+)$/',
    'const decimal = /.*/',
  ),
  filter('empty text filters', "      form.text === ''", '      false'),
  filter('no option ticked filters', '      form.options.length === 0', '      false'),
  filter('any filters', "      form.checked === 'any'", '      false'),
  filter(
    'case folds beyond ASCII',
    'text.replace(/[A-Z]/g, letter => String.fromCharCode(letter.charCodeAt(0) + 32))',
    'text.toLowerCase()',
  ),
  filter('a lower bound is left out', '(value as number) >= low', '(value as number) > low'),
  filter('an invalid date is kept', '        if (Number.isNaN(date.getTime())) return false\n', ''),
  grid(
    'a change is judged against the form before it',
    'const reports = reading.invalid.length === 0 && !Equal.equals(reading.filter, base.reported)',
    'const reports =\n          reading.invalid.length === 0 &&\n          !Equal.equals(reading.filter, readForm(kind, base.form).filter)',
  ),
  grid(
    'a bound that is no number is reported',
    'const reports = reading.invalid.length === 0 && !Equal.equals',
    'const reports = !Equal.equals',
  ),
  grid(
    'every key of a stale frame starts over',
    '        Equal.equals(reported, filtering.reported)',
    '        true',
  ),
  grid(
    'a stale frame starts over from nothing',
    '          ? { ...filtering, form: formOf(drawn), reported: drawn }',
    '          ? filtering',
  ),
  grid(
    'a paste lands while the form is open',
    "Match.tag('Pasted', 'FillRequested', 'UndoRequested', 'RedoRequested', () => ({",
    "Match.tag('FillRequested', 'UndoRequested', 'RedoRequested', () => ({",
  ),
  grid('a typed edit leaves the form open', "              'EditTyped',\n", ''),
  grid(
    'a hidden column opens',
    'if (kind === undefined || model.columns.hidden.includes(column) || !accepted) {',
    'if (kind === undefined || !accepted) {',
  ),
  grid(
    'a drawn filter the column refuses opens',
    'if (kind === undefined || model.columns.hidden.includes(column) || !accepted) {',
    'if (kind === undefined || model.columns.hidden.includes(column)) {',
  ),
  grid(
    'options are kept in the order ticked',
    'options: offered.filter(each => (each === option ? on : ticked.has(each))),',
    'options: on ? [...form.options, option] : form.options.filter(each => each !== option),',
  ),
  grid(
    'hiding a column leaves its form open',
    '              off(Option.map(filtering, each => each.column)) ? Option.none() : filtering,',
    '              filtering,',
  ),
  grid(
    'clearing keeps the form',
    '      FilterCleared: (): Return => filterEdited(model, Option.none(), () => Option.some(emptyForm)),',
    '      FilterCleared: (): Return => ({ model }),',
  ),
]
