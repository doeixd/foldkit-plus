/**
 * The sidebar's filter over the page list, broken in turn: `pnpm mutate
 * examples/pages/test/filter.mutations.ts`.
 */
const file = '../src/app.ts'
const tests = ['examples/pages/test/pages.test.ts']

export default [
  {
    name: 'the filter is ignored',
    edits: [{ file, find: 'titleOf(page).toLowerCase().includes(wanted)', replace: 'true' }],
    tests,
  },
  {
    name: 'the query is matched by its case',
    edits: [{ file, find: 'model.filter.trim().toLowerCase()', replace: 'model.filter.trim()' }],
    tests,
  },
  {
    name: 'the space around the query counts',
    edits: [
      { file, find: 'model.filter.trim().toLowerCase()', replace: 'model.filter.toLowerCase()' },
    ],
    tests,
  },
  {
    name: 'an untitled page is not found by the name it is shown under',
    edits: [
      {
        file,
        find: 'titleOf(page).toLowerCase().includes(wanted)',
        replace: 'page.title.toLowerCase().includes(wanted)',
      },
    ],
    tests,
  },
  {
    name: 'a page in the trash is listed when it matches',
    edits: [
      {
        file,
        find: 'page => page.trashed !== true && titleOf(page)',
        replace: 'page => titleOf(page)',
      },
    ],
    tests,
  },
  {
    name: 'a query that did not change is a new Model',
    edits: [{ file, find: 'query === model.filter', replace: 'false' }],
    tests,
  },
]
