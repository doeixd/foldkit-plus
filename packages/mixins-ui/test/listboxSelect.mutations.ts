/**
 * The select drawn over Listbox, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/listboxSelect.mutations.ts` checks
 * that a test fails for every one.
 */
const unit = 'packages/mixins-ui/test/listbox.test.ts'
const browser = 'packages/mixins-ui/test/listboxSelect.browser.test.ts'

export default [
  {
    name: 'the check is read aloud',
    edits: [
      {
        file: '../src/listbox.ts',
        find: 'h.span(builders.itemCheck.attrs([h.AriaHidden(true)]), []),',
        replace: 'h.span(builders.itemCheck.attrs(), []),',
      },
    ],
    tests: [unit],
  },
  {
    name: 'the trigger shows the placeholder once chosen',
    edits: [
      {
        file: '../src/listbox.ts',
        find: 'onSome: content => content.label })',
        replace: 'onSome: () => placeholder })',
      },
    ],
    tests: [unit],
  },
  {
    name: 'the placeholder is not marked',
    edits: [
      {
        file: '../src/listbox.ts',
        find: "h.DataAttribute('placeholder', String(Option.isNone(chosen)))",
        replace: "h.DataAttribute('placeholder', 'false')",
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'every row shows its check',
    edits: [{ file: '../src/recipes/listbox.ts', find: "visibility: 'hidden',", replace: '' }],
    tests: [browser],
  },
  {
    name: 'check start leaves the check at the end',
    edits: [
      {
        file: '../src/recipes/listbox.ts',
        find: "start: { itemCheck: variant(Style.self({ order: '-1' })) },",
        replace: 'start: {},',
      },
    ],
    tests: [browser],
  },
  {
    name: 'the chevron does not turn while open',
    edits: [{ file: '../src/recipes/listbox.ts', find: "rotate: '225deg',", replace: '' }],
    tests: [browser],
  },
  {
    name: 'the placeholder reads in the default ink',
    edits: [
      {
        file: '../src/recipes/listbox.ts',
        find: "Style.states({ true: { color: ref.text.muted } }, 'data-placeholder'),",
        replace: '',
      },
    ],
    tests: [browser],
  },
]
