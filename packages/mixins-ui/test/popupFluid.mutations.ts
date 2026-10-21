/**
 * The popups' fluid highlight and indicator, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/popupFluid.mutations.ts`.
 */
const tests = ['packages/mixins-ui/test/popupFluid.browser.test.ts']
const popup = '../src/recipes/popup.ts'

export default [
  {
    name: 'the listbox draws no rows box for fluid to run on',
    edits: [
      {
        file: '../src/listbox.ts',
        find: 'rows: render.items === undefined ? undefined : builders.rows.attrs(),',
        replace: 'rows: undefined,',
      },
    ],
    tests,
  },
  {
    name: 'the keys do not move the highlight',
    edits: [{ file: '../src/listbox.ts', find: "follows: '[data-active]',", replace: '' }],
    tests,
  },
  {
    name: 'a chosen row keeps its fill under the indicator',
    edits: [
      {
        file: '../src/recipes/listbox.ts',
        find: 'Style.nest(`${unlit}[aria-selected="true"]`',
        replace: 'Style.nest(\'&[aria-selected="true"]\'',
      },
    ],
    tests,
  },
  {
    name: 'a hovered row keeps its fill under the highlight',
    edits: [
      {
        file: popup,
        find: 'Style.nest(`${unlit}${HOVERED}`, lighted),',
        replace: 'Style.nest(`&${HOVERED}`, lighted),',
      },
    ],
    tests,
  },
  {
    name: 'the indicator never shows',
    edits: [
      {
        file: popup,
        find: "Style.nest(lit, { display: 'var(--fk-popup-chosen-display, none)' })",
        replace: "Style.nest(lit, { display: 'none' })",
      },
    ],
    tests,
  },
  {
    name: 'the indicator glides as the opening panel settles',
    edits: [
      {
        file: popup,
        find: "glide('moderate', 'var(--fk-popup-chosen-moving, 1)')",
        replace: "glide('moderate', '1')",
      },
    ],
    tests,
  },
  {
    name: "the menu's highlight lights no row",
    survives:
      'upstream marks the row under the pointer data-active as it does the keys, and follows lights that row; nearness reads only in gaps, which menu rows have none of',
    edits: [
      {
        file: '../src/menu.ts',
        find: 'item: \'[role^="menuitem"]\',',
        replace: 'item: \'[role="none"]\',',
      },
    ],
    tests,
  },
]
