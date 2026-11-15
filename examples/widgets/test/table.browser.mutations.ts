/**
 * The roster Table in a real browser, broken in turn: `pnpm mutate
 * examples/widgets/test/table.browser.mutations.ts`. Apart from the unit spec, since a spec that
 * mixes the two fails its baseline.
 */
const view = '../src/table/view.ts'
const browser = ['examples/widgets/test/table.browser.test.ts']

export default [
  {
    name: 'the name is a plain cell, not the row heading',
    edits: [{ file: view, find: 'rowHeader: true, ', replace: '' }],
    tests: browser,
  },
  {
    name: 'the row button sends nothing',
    edits: [{ file: view, find: 'onClick: Message.Toggled({ id: member.id }),', replace: '' }],
    tests: browser,
  },
  {
    name: 'the heading does not report the sort',
    edits: [{ file: view, find: 'sort: { by: model.sort,', replace: 'sort: { by: initial.sort,' }],
    tests: browser,
  },
  {
    name: 'the table does not recover focus when a sort moves a row',
    edits: [{ file: view, find: 'mixins: [recovery],', replace: '' }],
    tests: browser,
  },
  {
    name: 'the row button is not marked as a part to recover',
    edits: [{ file: view, find: "h.DataAttribute(FOCUS_MARK.part, 'control'),", replace: '' }],
    tests: browser,
  },
]
