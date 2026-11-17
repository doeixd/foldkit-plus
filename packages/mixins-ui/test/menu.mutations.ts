/**
 * The menu adapter, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/menu.mutations.ts` checks that a test
 * fails for every one.
 */
const tests = ['packages/mixins-ui/test/menu.test.ts']
const browser = ['packages/mixins-ui/test/menu.browser.test.ts']

export default [
  {
    name: 'the wrapper keeps its base bundles',
    edits: [
      {
        file: '../src/menu.ts',
        find: 'wrapper: builders.wrapper.attrs(render.wrapper),',
        replace: 'wrapper: render.wrapper,',
      },
    ],
    tests,
  },
  {
    name: 'the button keeps its base bundles',
    edits: [
      {
        file: '../src/menu.ts',
        find: 'button: builders.button.attrs(render.button),',
        replace: 'button: render.button,',
      },
    ],
    tests,
  },
  {
    name: 'the backdrop keeps its base bundles',
    edits: [
      {
        file: '../src/menu.ts',
        find: 'attributes: builders.backdrop.attrs(render.backdrop.attributes),',
        replace: 'attributes: render.backdrop.attributes,',
      },
    ],
    tests,
  },
  {
    name: 'items keep their base bundles',
    edits: [
      {
        file: '../src/menu.ts',
        find: 'attributes: builders.item.attrs(item.attributes),',
        replace: 'attributes: item.attributes,',
      },
    ],
    tests,
  },
  {
    // Both halves, as before the top layer: the wrapper alone removed leaves
    // a popover never shown, which the browser hides from every test.
    name: 'an open panel stays in the page flow',
    edits: [
      {
        file: '../src/menuView.ts',
        find: 'h.OnMount(topLayer(Menu.AnchorMenu({ buttonId: `${id}-button`, anchor })))',
        replace: 'h.OnMount(Menu.AnchorMenu({ buttonId: `${id}-button`, anchor }))',
      },
      {
        file: '../src/menuView.ts',
        find: "    h.Attribute('popover', 'manual'),\n",
        replace: '',
      },
    ],
    tests: browser,
  },
  {
    // The wrapper then passes over the panel, which stays in the page flow.
    name: 'a panel drawn without the popover attribute',
    edits: [
      {
        file: '../src/menuView.ts',
        find: "    h.Attribute('popover', 'manual'),\n",
        replace: '',
      },
    ],
    tests: browser,
  },
  {
    name: 'a key moves from the row the last drawing showed, not from where the previous key left off',
    edits: [
      {
        file: '../src/menuView.ts',
        find: '    reached = { ...reached, activeIndex: Option.some(targetIndex) }\n',
        replace: '',
      },
    ],
    tests: browser,
  },
  {
    name: 'type-ahead refines the query the last drawing held',
    edits: [
      {
        file: '../src/menuView.ts',
        find: '      searchQuery: nextQuery,\n',
        replace: '',
      },
    ],
    tests: browser,
  },
  {
    name: 'a key after type-ahead moves from the row the last drawing showed',
    edits: [
      {
        file: '../src/menuView.ts',
        find: '      activeIndex: Option.orElse(maybeTargetIndex, () => reached.activeIndex),\n',
        replace: '',
      },
    ],
    tests: browser,
  },
  {
    name: 'a shut menu opened by a key is still shut for the next key of its drawing',
    edits: [
      {
        file: '../src/menuView.ts',
        find: '    reached = { ...reached, isOpen: true, activeIndex: Option.some(index) }\n',
        replace: '',
      },
    ],
    tests: browser,
  },
  {
    name: 'Enter chooses the row the last drawing showed active',
    edits: [
      {
        file: '../src/menuView.ts',
        find: `      Match.when('Enter', () =>
        Option.map(reached.activeIndex,`,
        replace: `      Match.when('Enter', () =>
        Option.map(maybeActiveItemIndex,`,
      },
    ],
    tests: browser,
  },
  {
    name: 'Space after letters reads the query the last drawing held',
    edits: [
      {
        file: '../src/menuView.ts',
        find: `String.isNonEmpty(reached.searchQuery)
          ? searchForKey`,
        replace: `String.isNonEmpty(searchQuery)
          ? searchForKey`,
      },
    ],
    tests: browser,
  },
]
