/**
 * The overlay tests (lifecycle, leave, placement), broken in turn:
 * `pnpm mutate packages/mixins-ui/test/overlayLifecycle.mutations.ts`.
 *
 * Focus return, the dialog stack, the scroll lock and the inert page come from
 * `foldkit/dom`, pre-bundled out of reach of an in-memory edit, so those
 * tests are broken here through this package's wiring of the Dialog's view
 * (what the page needs for the Dialog to open and close at all), not through
 * `Dom.closeDialog` itself.
 */
const lifecycle = 'packages/mixins-ui/test/overlayLifecycle.browser.test.ts'
const leave = 'packages/mixins-ui/test/overlayLeave.browser.test.ts'
const placement = 'packages/mixins-ui/test/overlayPlacement.browser.test.ts'

export default [
  {
    name: 'a Dialog draws no dialog bundle, so it never opens or answers Escape',
    edits: [{ file: '../src/dialog.ts', find: ': render.dialog,', replace: ': [],' }],
    tests: [lifecycle, leave],
  },
  {
    name: 'a press on the Dialog backdrop is not a dismissal',
    edits: [
      { file: '../src/dialog.ts', find: 'backdrop: render.backdrop,', replace: 'backdrop: [],' },
    ],
    tests: [lifecycle],
  },
  {
    name: 'Escape in a Menu is not read as closing it',
    edits: [
      {
        file: '../src/menuView.ts',
        find: "Match.when('Escape', () => Option.some(Message.Closed())),",
        replace: "Match.when('Escape', () => Option.none()),",
      },
    ],
    tests: [lifecycle],
  },
  {
    name: 'a press outside a Menu closes nothing',
    edits: [
      {
        file: '../src/menuView.ts',
        find: `        h.OnMount(Menu.PortalMenuBackdrop()),
        ...(isLeaving ? [] : [h.OnClick(Message.Closed())]),`,
        replace: `        h.OnMount(Menu.PortalMenuBackdrop()),`,
      },
      { file: '../src/menuView.ts', find: 'h.OnBlur(Message.BlurredItems()),', replace: '' },
      {
        file: '../src/menu.ts',
        find: 'h.OnPointerDown(() => Option.some(onMessage(Message.PressedAway()))),',
        replace: '',
      },
    ],
    tests: [lifecycle],
  },
  {
    name: 'a leaving Menu row takes a press',
    edits: [
      {
        file: '../src/menuView.ts',
        find: 'const isInteractive = !isDisabledItem && !isLeaving',
        replace: 'const isInteractive = !isDisabledItem',
      },
    ],
    tests: [leave],
  },
  {
    name: 'a Listbox writes no dir for its direction',
    edits: [
      {
        file: '../src/listboxShared.ts',
        find: '...(direction === undefined ? [] : [h.Dir(direction)]),',
        replace: '',
      },
    ],
    tests: [placement],
  },
]
