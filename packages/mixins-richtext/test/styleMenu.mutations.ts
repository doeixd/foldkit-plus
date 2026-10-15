/**
 * The block style menu, each part broken in turn: `pnpm mutate
 * packages/mixins-richtext/test/styleMenu.mutations.ts` checks that a test fails for every one.
 */
const file = '../src/style.ts'
const tests = ['packages/mixins-richtext/test/styleMenu.test.ts']

export default [
  {
    name: 'the menu opens without a selection',
    edits: [{ file, find: '...(input.open && live\n', replace: '...(input.open\n' }],
    tests,
  },
  {
    name: 'nothing is checked',
    edits: [{ file, find: 'h.AriaChecked(style === chosen),', replace: 'h.AriaChecked(false),' }],
    tests,
  },
  {
    name: 'the trigger names the first style',
    edits: [
      {
        file,
        find: "h.span(slots.label.attrs(), [chosen?.label ?? 'Text style']),",
        replace: 'h.span(slots.label.attrs(), [styles[0]!.label]),',
      },
    ],
    tests,
  },
  {
    name: 'the trigger says nothing of being open',
    edits: [
      { file, find: 'h.AriaExpanded(input.open && live),', replace: 'h.AriaExpanded(false),' },
    ],
    tests,
  },
]
