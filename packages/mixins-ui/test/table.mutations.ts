/**
 * The table, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/table.mutations.ts` checks that a test
 * fails for every one.
 */
const tests = ['packages/mixins-ui/test/table.test.ts']
const browser = ['packages/mixins-ui/test/table.browser.test.ts']
const view = '../src/table.ts'
const recipe = '../src/recipes/table.ts'

export default [
  {
    name: 'numbers start-align with everything else',
    edits: [
      {
        file: recipe,
        find: "Style.nest('&[data-numeric]', { textAlign: 'end' }),\n    ),\n    controlCell",
        replace: "Style.nest('&[data-numeric]', { textAlign: 'start' }),\n    ),\n    controlCell",
      },
    ],
    tests: browser,
  },
  {
    name: "a number's heading start-aligns over it",
    edits: [
      {
        file: recipe,
        find: "Style.nest('&[data-numeric]', { textAlign: 'end' }),\n      Style.nest('&[aria-sort]'",
        replace:
          "Style.nest('&[data-numeric]', { textAlign: 'start' }),\n      Style.nest('&[aria-sort]'",
      },
    ],
    tests: browser,
  },
  {
    name: 'the caption draws as a span',
    edits: [
      {
        file: view,
        find: 'h.caption(builders.caption.attrs(), [options.caption])',
        replace: 'h.span(builders.caption.attrs(), [options.caption])',
      },
    ],
    tests,
  },
  {
    name: 'every sortable heading says it sorts the rows',
    edits: [
      {
        file: view,
        find: 'Option.filter(options.sort.by, sort => sort.column === key),',
        replace: 'options.sort.by,',
      },
    ],
    tests,
  },
  {
    name: 'a partly chosen heading reads unchecked',
    edits: [
      {
        file: view,
        find: 'indeterminate: chosen > 0 && chosen < rows.length,',
        replace: 'indeterminate: false,',
      },
    ],
    tests,
  },
  {
    name: 'no rows read as all chosen',
    edits: [
      {
        file: view,
        find: 'checked: rows.length > 0 && chosen === rows.length,',
        replace: 'checked: chosen === rows.length,',
      },
    ],
    tests,
  },
  {
    name: 'a detail misses the open column',
    edits: [{ file: view, find: ' + (expansion === undefined ? 0 : 1)', replace: '' }],
    tests,
  },
  {
    name: 'a shut row names a detail that is not drawn',
    edits: [
      {
        file: view,
        find: '...(open ? [h.AriaControls(detailId)] : []),',
        replace: 'h.AriaControls(detailId),',
      },
    ],
    tests,
  },
  {
    name: 'the open button sends the state it has',
    edits: [
      {
        file: view,
        find: 'h.OnClick(expansion.onToggle(row, !open)),',
        replace: 'h.OnClick(expansion.onToggle(row, open)),',
      },
    ],
    tests,
  },
  {
    name: 'the empty state stands beside rows',
    edits: [
      {
        file: view,
        find: 'rows.length === 0 && options.empty !== undefined',
        replace: 'options.empty !== undefined',
      },
    ],
    tests,
  },
  {
    name: "a checkbox's name is not the table's, so it shows",
    edits: [
      {
        file: view,
        find: 'h.span(builders.checkboxLabel.attrs(resolved.label), [label]),',
        replace: 'h.span(resolved.label, [label]),',
      },
    ],
    tests: browser,
  },
  {
    name: "every row's checkbox has one id",
    edits: [{ file: view, find: '`${selection.id}-${key}`,', replace: '`${selection.id}-row`,' }],
    tests,
  },
  {
    name: 'a descending sort starts over instead of clearing',
    edits: [
      {
        file: view,
        find: '          : Option.none(),',
        replace: "          : Option.some({ column, direction: 'ascending' as const }),",
      },
    ],
    tests,
  },
  {
    name: 'the highlight lights a detail row',
    edits: [
      {
        file: view,
        find: "const dataRow = 'tbody > tr:not([data-detail], [data-empty])'",
        replace: "const dataRow = 'tbody > tr'",
      },
    ],
    tests: browser,
  },
  {
    name: 'a sticky heading scrolls away',
    edits: [{ file: recipe, find: "position: 'sticky',", replace: "position: 'static'," }],
    tests: browser,
  },
  {
    name: 'a stripe covers a chosen row',
    edits: [{ file: recipe, find: ':not([data-selected])', replace: '' }],
    tests: browser,
  },
  {
    name: "a chosen row's wash hides the highlight",
    edits: [
      {
        file: recipe,
        find: "${ref.knob['state-hover']}, transparent)`",
        replace: "${ref.knob['state-hover']}, white)`",
      },
    ],
    tests: browser,
  },
  {
    name: 'an ascending chevron points down',
    edits: [{ file: recipe, find: "rotate: '-135deg',", replace: "rotate: '45deg'," }],
    tests: browser,
  },
  {
    name: "an unsorted heading's chevron always shows",
    edits: [
      {
        file: recipe,
        find: "rotate: '45deg', translate: '0 -0.1em', opacity: '0' }",
        replace: "rotate: '45deg', translate: '0 -0.1em', opacity: '1' }",
      },
    ],
    tests: browser,
  },
  {
    name: 'comfortable rows are compact',
    edits: [
      {
        file: recipe,
        find: 'comfortable: { root: steps.lg },',
        replace: 'comfortable: { root: steps.sm },',
      },
    ],
    tests: browser,
  },
  {
    name: 'an open row keeps its line',
    edits: [
      {
        file: recipe,
        find: "Style.nest('&[data-expanded]', { borderBlockEndColor: 'transparent' }),",
        replace: '',
      },
    ],
    tests: browser,
  },
]
