/**
 * Filters and sort (phase 4, and the phone's one sheet), broken in turn:
 * `pnpm mutate examples/foldkit/domains-plus/test/filters.mutations.ts`.
 */
const tests = ['examples/foldkit/domains-plus/test/filters.test.ts']

export default [
  {
    name: 'the filters never read the whole catalog',
    edits: [
      {
        file: '../src/client/app.ts',
        find: '  isCompleteCatalogRequired(model.availabilityFilter, model.sortOrder)',
        replace: '  false',
      },
    ],
    tests,
  },
  {
    name: 'an arrangement from fewer prices is kept after more land',
    edits: [{ file: '../src/client/results.ts', find: '? `${domains.length}`', replace: "? ''" }],
    tests,
  },
  {
    name: 'any value a dropdown sends becomes the sort',
    edits: [
      {
        file: '../src/client/app.ts',
        find: 'isSort(value) ? modifyFields(model, { sortOrder: () => value }) : model',
        replace: "modifyFields(model, { sortOrder: () => 'Relevance' })",
      },
    ],
    tests,
  },
  {
    name: 'the TLD sheet opens on the last search',
    edits: [
      {
        file: '../src/client/app.ts',
        find: "tldSheetStep(modifyFields(model, { tldSearchQuery: () => '' }), Sheet.open(model.tldSheet))",
        replace: 'tldSheetStep(model, Sheet.open(model.tldSheet))',
      },
    ],
    tests,
  },
  {
    name: 'the desktop dropdown chooses nothing',
    edits: [
      {
        file: '../src/client/app.ts',
        find: 'isTld(value) ? modifyFields(model, { tldFilter: () => value }) : model',
        replace: 'model',
      },
    ],
    tests,
  },
  {
    name: 'the phone filters sheet closes with focus nowhere near its button',
    edits: [
      {
        file: '../src/client/app.ts',
        find: 'sheetStep(model, next, filtersSheet, FocusFiltersButton())',
        replace: 'sheetStep(model, next, filtersSheet, FocusSearchInput())',
      },
    ],
    tests,
  },
]
