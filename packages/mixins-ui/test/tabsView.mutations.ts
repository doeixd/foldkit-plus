/**
 * `Tabs.view`, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/tabsView.mutations.ts` checks that a
 * test fails for every one.
 */
const browser = 'packages/mixins-ui/test/tabsView.browser.test.ts'

export default [
  {
    name: 'every row’s panel is drawn, not the chosen one’s',
    edits: [
      {
        file: '../src/tabs.ts',
        find: '.filter(tab => tab.index === activeIndex)',
        replace: '.filter(() => true)',
      },
    ],
    tests: [browser],
  },
  {
    name: 'a disabled row stays enabled',
    edits: [
      {
        file: '../src/tabs.ts',
        find: 'isTabDisabled: value => disabled.has(value),',
        replace: 'isTabDisabled: () => false,',
      },
    ],
    tests: [browser],
  },
  {
    name: 'upright tabs are drawn flat',
    edits: [
      { file: '../src/tabs.ts', find: "options.orientation === 'vertical' ?", replace: 'false ?' },
    ],
    tests: [browser],
  },
  {
    name: 'a preset is ignored',
    edits: [
      {
        file: '../src/tabs.ts',
        find: 'view(layered(config, options), h)',
        replace: 'view(options, h)',
      },
    ],
    tests: [browser],
  },
  {
    name: 'the close buttons are drawn in no item',
    edits: [
      {
        file: '../src/tabs.ts',
        find: 'onSome: close => h.div(tab.item, [button, h.button(close, [])]),',
        replace: 'onSome: () => button,',
      },
    ],
    tests: [browser],
  },
]
