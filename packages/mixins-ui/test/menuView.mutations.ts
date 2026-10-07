/**
 * The forked menu view, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/menuView.mutations.ts` checks that a
 * test fails for every one. The parity battery draws the fork against
 * upstream's markup, so a fork-only change that keeps the adapter compiling
 * must still fail here.
 */
const tests = ['packages/mixins-ui/test/menuView.test.ts']

export default [
  {
    name: 'the button reports the inverted open state',
    edits: [
      {
        file: '../src/menuView.ts',
        find: 'h.AriaExpanded(isVisible),',
        replace: 'h.AriaExpanded(!isVisible),',
      },
    ],
    tests,
  },
  {
    name: 'the panel is a menubar',
    edits: [
      {
        file: '../src/menuView.ts',
        find: "h.Role('menu'),",
        replace: "h.Role('menubar'),",
      },
    ],
    tests,
  },
  {
    name: 'items carry no click message',
    edits: [
      {
        file: '../src/menuView.ts',
        find: 'h.OnClick(dispatchSelectedItem(item, index)),',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'the backdrop never draws',
    edits: [
      {
        file: '../src/menuView.ts',
        find: '...(render.backdrop === undefined\n          ? []\n          : [h.keyed',
        replace: '...([]\n          ? []\n          : [h.keyed',
      },
    ],
    tests,
  },
  {
    name: 'ungrouped menus draw no items',
    edits: [
      {
        file: '../src/menuView.ts',
        find: 'separator: undefined,\n          items: itemRenders,',
        replace: 'separator: undefined,\n          items: [],',
      },
    ],
    tests,
  },
  {
    name: 'group headings lose their presentation role',
    edits: [
      {
        file: '../src/menuView.ts',
        find: "h.Role('presentation'),",
        replace: "h.Role('none'),",
      },
    ],
    tests,
  },
  {
    name: 'separators lose their separator role',
    edits: [
      {
        file: '../src/menuView.ts',
        find: "h.Role('separator'),",
        replace: "h.Role('presentation'),",
      },
    ],
    tests,
  },
]
