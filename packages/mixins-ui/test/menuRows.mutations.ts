/**
 * A Menu's checkbox, radio, grouped, shortcut and destructive rows, broken in
 * turn: `pnpm mutate packages/mixins-ui/test/menuRows.mutations.ts` checks
 * that a test fails for every one.
 */
const file = '../src/menu.ts'
const recipe = '../src/recipes/menu.ts'
const browser = ['packages/mixins-ui/test/menuRows.browser.test.ts']
const unit = ['packages/mixins-ui/test/menuUpdate.test.ts']

export default [
  {
    name: 'a check row chosen closes the menu as any row does',
    edits: [
      {
        file,
        find: 'Option.filter(Option.fromNullishOr(rows[index]), isCheck),',
        replace: 'Option.filter(Option.fromNullishOr(rows[index]), () => false),',
      },
    ],
    tests: [...browser, ...unit],
  },
  {
    name: 'a chosen check row sends nothing out',
    edits: [
      {
        file,
        find: `    ChoseCheck: ({ value }) => ({
      model,
      outMessage: OutMessage.Selected({ value, submenu: Option.none() }),
    }),`,
        replace: `    ChoseCheck: () => ({ model }),`,
      },
    ],
    tests: [...browser, ...unit],
  },
  {
    name: 'a check row keeps the role of a plain row',
    edits: [
      {
        file,
        find: "h.Role(row.check === 'checkbox' ? 'menuitemcheckbox' : 'menuitemradio'),",
        replace: '',
      },
    ],
    tests: browser,
  },
  {
    name: 'no separator parts the groups',
    edits: [{ file, find: 'at === 0 || group.separator !== undefined', replace: 'true' }],
    tests: browser,
  },
  {
    name: 'rows are never grouped',
    edits: [
      {
        file,
        find: 'if (!rows.some(row => row.group !== undefined)) return {}',
        replace: 'return {}',
      },
    ],
    tests: browser,
  },
  {
    name: 'only check rows keep the mark column',
    edits: [
      {
        file,
        find: `  const builders = buildersOf(MenuSlots, options.mixins, { h })
  const marked = rows.some(isCheck)`,
        replace: `  const builders = buildersOf(MenuSlots, options.mixins, { h })
  const marked = rows.length < 0`,
      },
    ],
    tests: browser,
  },
  {
    name: 'symbols are named as drawn',
    edits: [{ file, find: 'KEY_NAMES.get(key) ?? key', replace: 'key' }],
    tests: [...browser, ...unit],
  },
  {
    name: "a Menubar's check row closes its menu",
    edits: [
      {
        file: '../src/menubar.ts',
        find: 'onSome: row => Message.ChoseCheck({ menu: index, value: row.label }),',
        replace: 'onSome: () => Message.GotMenu({ index, message }),',
      },
    ],
    tests: browser,
  },
  {
    name: 'an unchecked radio row shows its dot',
    edits: [
      {
        file: recipe,
        find: `'&[data-kind="radio"][data-checked="true"]::before'`,
        replace: `'&[data-kind="radio"]::before'`,
      },
    ],
    tests: browser,
  },
  {
    name: 'the shortcut takes the row direction',
    edits: [
      {
        file: recipe,
        find: "Style.nest('& > *', { direction: 'ltr', unicodeBidi: 'isolate' }),",
        replace: '',
      },
    ],
    tests: browser,
  },
  {
    name: 'a destructive row keeps the ink of the rest',
    edits: [
      {
        file: recipe,
        find: `Style.pseudo('[data-tone="destructive"]', { color: ref.error.ink }),`,
        replace: '',
      },
    ],
    tests: browser,
  },
]
