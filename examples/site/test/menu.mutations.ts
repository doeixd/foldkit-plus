/**
 * The phone menu, broken in turn: `pnpm mutate examples/site/test/menu.mutations.ts`.
 */
const tests = ['examples/site/test/menu.browser.test.ts']

const edit = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit(
    'the open menu holds no history entry',
    '../src/shell.ts',
    "history.pushState({ [MENU_ENTRY]: true }, '')",
    '',
  ),
  edit(
    'Back does not close the menu',
    '../src/shell.ts',
    "addEventListener('popstate', close)\n",
    '',
  ),
  edit(
    'a menu closed another way leaves its history entry',
    '../src/shell.ts',
    'if (holdsMenuEntry()) history.back()\n      }',
    '}',
  ),
  edit(
    'a widened window leaves the menu open',
    '../src/shell.ts',
    'if (!narrow.matches) close()',
    '',
  ),
  edit(
    'a link leaves the menu entry behind',
    '../src/shell.ts',
    '      history.back()\n    }),\n})',
    '      go()\n    }),\n})',
  ),
  edit(
    'the Menu button never says it is open',
    '../src/view/frame.ts',
    'h.AriaExpanded(Sheet.isOpen(model.menu)),',
    'h.AriaExpanded(false),',
  ),
  edit(
    'the Menu button is a sliver',
    '../src/style.ts',
    "        minBlockSize: '2.75rem',\n        minInlineSize: '2.75rem',\n        padding: `0.25rem ${t.space.md}`,",
    '        padding: `0.25rem ${t.space.md}`,',
  ),
  edit(
    'a link of the menu is as short as the rail’s',
    '../src/style.ts',
    "        minBlockSize: '2.75rem',\n        paddingBlock: '0.25rem',\n        fontSize: '1rem',",
    "        paddingBlock: '0.25rem',\n        fontSize: '1rem',",
  ),
  edit(
    'the menu leaves faster than it comes',
    '../src/style.ts',
    "      dialog: Style.self({ '--fk-motion-sheet-exit': t.motion.sheet }),\n",
    '',
  ),
  edit(
    'the rail body shows under the phone bar as well as in the menu',
    '../src/style.ts',
    "      { display: 'flex', flexDirection: 'column', gap: t.space.lg },\n      Style.media(NARROW, { display: 'none' }),",
    "      { display: 'flex', flexDirection: 'column', gap: t.space.lg },",
  ),
  edit(
    'the menu button shows at a desktop width',
    '../src/style.ts',
    "      Style.media(NARROW, { display: 'inline-flex' }),\n      focus,",
    "      { display: 'inline-flex' },\n      focus,",
  ),
]
