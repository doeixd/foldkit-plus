/**
 * The shared menu, listbox and combobox drawing, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/popupView.mutations.ts`. The forks'
 * parity batteries hold the drawing to upstream's markup, and the adapters'
 * tests hold their default draw to it.
 */
const forks = [
  'packages/mixins-ui/test/menuView.test.ts',
  'packages/mixins-ui/test/listboxView.test.ts',
  'packages/mixins-ui/test/comboboxView.test.ts',
]
const view = '../src/popupView.ts'

export default [
  {
    name: 'a group loses its heading',
    edits: [
      {
        file: view,
        find: "h.keyed('div')(group.group.key, group.group.attributes, [...heading, ...items]),",
        replace: "h.keyed('div')(group.group.key, group.group.attributes, items),",
      },
    ],
    tests: forks,
  },
  {
    name: 'a group loses its separator',
    edits: [
      { file: view, find: '    ...(group.separator === undefined\n', replace: '    ...(true\n' },
    ],
    tests: forks,
  },
  {
    name: 'the panel drops its scroll region',
    edits: [
      {
        file: view,
        find: 'h.div(panel.scroll, groups),',
        replace: 'groups,',
      },
    ],
    tests: forks,
  },
  {
    name: 'the listbox drops its form inputs',
    edits: [{ file: view, find: '    ...listbox.hiddenInputs,\n', replace: '' }],
    tests: forks,
  },
  {
    name: 'the combobox draws no toggle',
    edits: [
      {
        file: view,
        find: '      ...(combobox.toggleButton === undefined\n',
        replace: '      ...(true\n',
      },
    ],
    tests: forks,
  },
  ...[
    ['menu', 'drawMenu'],
    ['listbox', 'drawListbox'],
    // Its default draws the field around popupView's drawing, as `draw`.
    ['combobox', 'draw'],
  ].map(([name, draw]) => ({
    name: `the ${name} draws nothing without a draw`,
    edits: [
      {
        file: `../src/${name}.ts`,
        find: `${draw}(resolved, context.h),`,
        replace: 'context.h.div([], []),',
      },
    ],
    tests: [`packages/mixins-ui/test/${name}.test.ts`],
  })),
  {
    name: "a combobox drops the adapter's parts",
    edits: [
      { file: view, find: '      ...(combobox.afterInput ?? []),\n', replace: '' },
      { file: view, find: '    ...(combobox.afterPanel ?? []),\n', replace: '' },
    ],
    tests: ['packages/mixins-ui/test/popupView.test.ts'],
  },
]
