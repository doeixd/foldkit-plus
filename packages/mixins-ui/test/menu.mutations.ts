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
]
