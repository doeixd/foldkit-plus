/**
 * `Fill`'s rules, broken in turn: `pnpm mutate packages/data-grid/test/fill.mutations.ts`
 * checks that a test fails for every one.
 */
const tests = ['packages/data-grid/test/fill.test.ts']
const file = '../src/fill.ts'
const one = (name: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  one(
    'one number counts on',
    '  if (source.length < 2) return repeated',
    '  if (source.length < 1) return repeated',
  ),
  one('text counts as a number', '  if (parsed.some(match => match === null)) return repeated', ''),
  one('decimals are dropped', 'const decimals = Math.max(', 'const decimals = 0 * Math.max('),
  one(
    'an uneven step counts on',
    '  if (units.some((unit, index) => index > 0 && unit - units[index - 1]! !== step)) return repeated',
    '',
  ),
  one(
    'backward counts on from the last',
    'const from = backward ? units[0]! : units[units.length - 1]!',
    'const from = units[units.length - 1]!',
  ),
  one('backward steps forward', '(backward ? -step : step)', 'step'),
  one(
    'a pattern runs on forward when filling back',
    'backward ? at(-1 - index) : at(source.length + index)',
    'at(source.length + index)',
  ),
  one('a cell inside fills', '      if (rows <= 0 && columns <= 0) return Option.none()', ''),
  one('columns win a diagonal', '      if (rows >= columns) {', '      if (rows > columns) {'),
  one('a fill up fills down', '          below > 0\n', '          true\n'),
  one(
    'a fill left fills right',
    'columns: right > 0 ? columnsOf(last + 1, to.column + 1) : columnsOf(to.column, first)',
    'columns: columnsOf(last + 1, to.column + 1)',
  ),
  one('a column that does not edit is filled', '    options.editable(column)\n', '    true\n'),
  one(
    'a fill back starts far from the source',
    '(backward ? [...items].reverse() : items)',
    'items',
  ),
]
