/**
 * What an application asks of the grid from outside: `pnpm mutate
 * packages/data-grid/test/outside.mutations.ts` checks that a test fails for
 * every rule broken in turn.
 */
const grid = '../src/grid.ts'
const tests = ['packages/data-grid/test/outside.test.ts']
const one = (name: string, find: string, replace: string) => ({
  name,
  edits: [{ file: grid, find, replace }],
  tests,
})

export default [
  one(
    'reveal scrolls for a row the rows do not have',
    'target.row >= 0 && target.row < addressableRows(projection.rows.count)',
    'true',
  ),
  one(
    'reveal scrolls sideways with no column named',
    'left: target.column === undefined ? model.viewport.left : left,',
    'left,',
  ),
  one(
    'reveal ignores the viewport it is scrolled from',
    'viewport: model.viewport,\n      position: { row: target.row, column },',
    'viewport: { ...model.viewport, top: 0 },\n      position: { row: target.row, column },',
  ),
  one(
    'a range is sized by its rows alone',
    'columns: box.columns.length,\n          cells: rowCount * box.columns.length,',
    'columns: 1,\n          cells: rowCount,',
  ),
  one(
    'a range is counted as it was selected, hidden corners included',
    'Option.map(GridSelection.boxOf(project(rows, model.columns), range), box => {',
    'Option.map(GridSelection.boxOf(project(rows, { ...model.columns, hidden: [] }), range), box => {',
  ),
  one(
    'a filter taken off still counts',
    'Object.values<Option.Option<ColumnFilter>>(filters).filter(Option.isSome).length',
    'Object.values<Option.Option<ColumnFilter>>(filters).length',
  ),
  one(
    'a copy is reported while the filter form has the clipboard',
    "Match.tag('Pasted', 'Copied', 'FillRequested'",
    "Match.tag('Pasted', 'FillRequested'",
  ),
  one('a copy reports nothing', 'outMessage: Out.Copied({ rows, columns }),', ''),
  {
    name: 'the reveal Command scrolls the container nowhere',
    edits: [
      {
        file: grid,
        find: 'GridViewport.scrollTo(options.id, {\n              top,\n',
        replace: 'GridViewport.scrollTo(options.id, {\n              top: 0,\n',
      },
    ],
    tests: ['packages/mixins-data-grid/test/reveal.browser.test.ts'],
  },
]
