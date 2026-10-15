/**
 * The virtual list, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/virtualList.mutations.ts` checks that
 * a test fails for every one.
 */
const file = '../src/virtualList.ts'
const unit = 'packages/mixins-ui/test/virtualList.test.ts'

export default [
  {
    name: 'a row is drawn outside its slot',
    edits: [
      {
        file,
        find: 'h.div(builders.row.attrs(), [itemToView(item, index)])',
        replace: 'h.div([], [itemToView(item, index)])',
      },
    ],
    tests: [unit],
  },
  {
    name: 'the list is drawn outside its root slot',
    edits: [
      {
        file,
        find: "builders.root.attrs(overlay ? [h.OnMount(ScrollBars({ scroller: ':scope > ul' }))] : []),",
        replace: '[],',
      },
    ],
    tests: [unit],
  },
  {
    name: 'the overscan asked for is dropped',
    edits: [{ file, find: '...(overscan === undefined ? {} : { overscan }),', replace: '' }],
    tests: [unit],
  },
  {
    name: "an item's own height is dropped",
    edits: [
      {
        file,
        find: 'return options.itemToRowHeightPx === undefined\n    ? {}\n    : { itemToRowHeightPx: options.itemToRowHeightPx }',
        replace: 'return {}',
      },
    ],
    tests: [unit],
  },
  {
    name: 'the estimate of a dynamic row is dropped',
    edits: [
      {
        file,
        find: '...(options.itemToEstimatedRowHeightPx === undefined\n        ? {}\n        : { itemToEstimatedRowHeightPx: options.itemToEstimatedRowHeightPx }),',
        replace: '',
      },
    ],
    tests: [unit],
  },
]
