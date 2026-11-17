/** `pnpm mutate examples/data-grid/test/toolbar.mutations.ts`: the toolbar's search and density, broken in turn. */
const tests = ['examples/data-grid/test/registry.test.ts']
const main = '../src/main.ts'
const body = '../src/toolbarBody.ts'

export default [
  {
    name: 'the search finds every product',
    edits: [{ file: main, find: "needle === '' ||", replace: 'true ||' }],
    tests,
  },
  {
    name: 'a kept search answers the next one',
    edits: [{ file: main, find: 'known.search === search', replace: 'true' }],
    tests,
  },
  {
    name: 'the search reads the UPC only',
    edits: [
      {
        file: main,
        find: '[product.description, product.line, product.upc]',
        replace: '[product.upc]',
      },
    ],
    tests,
  },
  {
    name: 'a picked density is not kept',
    edits: [
      {
        file: body,
        find: ': { model: modifyFields(model, { density: () => density }) },',
        replace: ': { model },',
      },
    ],
    tests,
  },
  {
    name: 'a Mac is shown the Windows chords',
    edits: [
      {
        file: body,
        find: 'formatHotkey(pattern!, platform)',
        replace: "formatHotkey(pattern!, 'windows')",
      },
    ],
    tests: ['examples/data-grid/test/shortcuts.test.ts'],
  },
]
