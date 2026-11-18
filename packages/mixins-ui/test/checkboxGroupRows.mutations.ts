/**
 * A checkbox group's row content and card, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/checkboxGroupRows.mutations.ts` checks
 * that a test fails for every one.
 */
const tests = ['packages/mixins-ui/test/checkboxGroupRows.browser.test.ts']

export default [
  {
    name: 'the mark before the words is not drawn',
    edits: [
      {
        file: '../src/checkboxGroup.ts',
        find: '[h.span(builders.icon.attrs(), [option.icon])]',
        replace: '[]',
      },
    ],
    tests,
  },
  {
    name: 'words of the application’s own drawing name the box instead of the label',
    edits: [
      {
        file: '../src/checkboxGroup.ts',
        find: '...(option.content === undefined ? [] : [h.AriaLabel(option.label)]),',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a card’s label is not stretched over it',
    edits: [
      { file: '../src/recipes/checkboxGroup.ts', find: "inset: '0',", replace: "inset: 'auto'," },
    ],
    tests,
  },
  {
    name: 'a card’s trailing mark sits under the stretched label',
    edits: [
      {
        file: '../src/recipes/checkboxGroup.ts',
        find: "trailing: variant(Style.self({ position: 'relative' }))",
        replace: 'trailing: variant(Style.self({}))',
      },
    ],
    tests,
  },
]
