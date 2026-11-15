/**
 * A Menu row's icon and hint, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/menuParts.mutations.ts` checks that a
 * test fails for every one.
 */
const file = '../src/menu.ts'
const recipe = '../src/recipes/menu.ts'
const browser = ['packages/mixins-ui/test/menuParts.browser.test.ts']

export default [
  {
    name: 'a row draws no icon',
    edits: [
      {
        file,
        find: 'row.icon === undefined ? [] : [h.span(builders.icon.attrs([h.AriaHidden(true)]), [row.icon])]',
        replace: '[]',
      },
    ],
    tests: browser,
  },
  {
    name: 'a row draws no hint',
    edits: [
      {
        file,
        find: 'row.hint === undefined ? [] : [h.span(builders.hint.attrs(), [row.hint])]',
        replace: '[]',
      },
    ],
    tests: browser,
  },
  {
    name: 'the icon is read beside the label',
    edits: [
      { file, find: 'builders.icon.attrs([h.AriaHidden(true)])', replace: 'builders.icon.attrs()' },
    ],
    tests: browser,
  },
  {
    name: "a submenu's row draws no icon",
    edits: [
      {
        file,
        find: '                    ...iconPart(row, builders, h),\n                    h.span(builders.label.attrs([h.Id(labelId)])',
        replace: '                    h.span(builders.label.attrs([h.Id(labelId)])',
      },
    ],
    tests: browser,
  },
  {
    name: "a submenu's items draw no parts",
    edits: [
      {
        file,
        find: `            row.items,
            { mixins: submenuMixins, kbd: options.kbd },`,
        replace: `            [],
            { mixins: submenuMixins, kbd: options.kbd },`,
      },
    ],
    tests: browser,
  },
  {
    name: 'the hint keeps no room after the words',
    edits: [
      {
        file: recipe,
        find: "    hint: component(\n      Style.self({\n        flex: 'none',\n        marginInlineStart: ref.space.md,\n",
        replace: "    hint: component(\n      Style.self({\n        flex: 'none',\n",
      },
    ],
    tests: browser,
  },
]
