/**
 * The overlays' Bundles, Toast actions and the revise of a payload toast,
 * broken in turn: `pnpm mutate packages/mixins-ui/test/overlays.mutations.ts`.
 */
const bundles = 'packages/mixins-ui/test/overlayBundles.test.ts'
const revise = 'packages/mixins-ui/test/toastRevise.test.ts'
const toast = 'packages/mixins-ui/test/toast.browser.test.ts'
const overlays = 'packages/mixins-ui/test/overlays.browser.test.ts'
const configured = 'packages/mixins-ui/test/overlayConfigure.test.ts'
const layer = 'view: (options, h) => view(layered(config, options), h),'
const stack = 'packages/mixins-ui/test/toastStack.test.ts'

export default [
  {
    name: 'a dialog that is not dismissible still closes on a dismissal',
    edits: [
      { file: '../src/bundles/dialog.ts', find: 'dismissible === false &&', replace: 'false &&' },
    ],
    tests: [bundles],
  },
  {
    name: 'a dialog that is not dismissible closes on Escape and the backdrop in a browser',
    edits: [
      { file: '../src/bundles/dialog.ts', find: 'dismissible === false &&', replace: 'false &&' },
    ],
    tests: [overlays],
  },
  {
    name: 'a Dialog Bundle drops isAnimated, so its exit is a cut',
    edits: [
      {
        file: '../src/bundles/dialog.ts',
        find: 'UiDialog.init(config)',
        replace: 'UiDialog.init({ ...config, isAnimated: false })',
      },
    ],
    tests: [overlays],
  },
  {
    name: 'a Popover Bundle drops isAnimated, so its exit is a cut',
    edits: [
      {
        file: '../src/bundles/popover.ts',
        find: 'UiPopover.init(args)',
        replace: 'UiPopover.init({ ...args, isAnimated: false })',
      },
    ],
    tests: [overlays],
  },
  ...[
    ['Timer', 'timer'],
    ['ColorPicker', 'colorPicker'],
    ['Toast', 'toast'],
  ].map(([widget, file]) => ({
    name: `${widget}.configure draws the call alone, ignoring its base and presets`,
    edits: [
      {
        file: `../src/${file}.ts`,
        find: layer,
        replace: 'view: (options, h) => view(options, h),',
      },
    ],
    tests: [configured],
  })),
  {
    name: 'a countdown with no duration is placed anyway',
    edits: [
      {
        file: '../src/bundles/timer.ts',
        find: 'countdown === true && duration === undefined',
        replace: 'false',
      },
    ],
    tests: [bundles],
  },
  {
    name: 'a color the picker holds again is reported as changed',
    edits: [
      {
        file: '../src/bundles/colorPicker.ts',
        find: 'before.h !== after.h ||',
        replace: 'true ||',
      },
    ],
    tests: [bundles],
  },
  {
    name: 'a toast action always says the first action’s value',
    edits: [{ file: '../src/toast.ts', find: 'entry.actions[index]', replace: 'entry.actions[0]' }],
    tests: [bundles, stack],
  },
  {
    name: 'a toast action is pressed by its entry alone, so every button says the first',
    edits: [
      {
        file: '../src/toast.ts',
        find: 'Message.PressedAction({ id: entry.id, index })',
        replace: 'Message.PressedAction({ id: entry.id, index: 0 })',
      },
    ],
    tests: [toast],
  },
  {
    name: 'a cancel button says an action’s value instead of only dismissing',
    edits: [
      {
        file: '../src/toast.ts',
        find: 'h.OnClick(onMessage(Message.Dismissed({ id: entry.id }))),\n                        ]),\n                        [label],',
        replace:
          'h.OnClick(onMessage(Message.PressedAction({ id: entry.id, index: 1 }))),\n                        ]),\n                        [label],',
      },
    ],
    tests: [toast],
  },
  {
    name: 'an action button has no hover fill',
    edits: [
      {
        file: '../src/recipes/toast.ts',
        find: 'hover({ background: `color-mix(in oklab, ${ref.text.default} 82%, ${ref.surface.base})` }),',
        replace: '',
      },
    ],
    tests: [toast],
  },
  {
    name: 'two toast buttons or more stay beside the words',
    edits: [{ file: '../src/recipes/toast.ts', find: "flexBasis: '100%',", replace: '' }],
    tests: [toast],
  },
  {
    name: 'an inverted toast keeps the plain card’s fill',
    edits: [
      {
        file: '../src/recipes/toast.ts',
        find: 'borderColor: ref.text.default,',
        replace: "borderColor: ref.text.default, background: 'transparent',",
      },
    ],
    tests: [toast],
  },
  {
    name: 'a revised toast leaves the model it was given when the entry is missing',
    edits: [
      {
        file: '../src/toastView.ts',
        find: 'model.entries.some(entry => entry.id === entryId)',
        replace: 'true',
      },
    ],
    tests: [revise],
  },
  {
    name: 'a revision replaces every entry’s payload',
    edits: [
      {
        file: '../src/toastView.ts',
        find: 'entry.id === entryId ? { ...entry, payload } : entry',
        replace: '({ ...entry, payload })',
      },
    ],
    tests: [revise],
  },
  {
    name: 'a Sheet opened by the Dialog’s own Message rests where it was left',
    edits: [
      {
        file: '../src/sheet.ts',
        find: "        updateDialog(model.dialog, message),\n        Match.value(message).pipe(\n          Match.tag('RequestedOpen', () => (model.dialog.isOpen ? {} : { at: model.opensAt })),",
        replace:
          "        updateDialog(model.dialog, message),\n        Match.value(message).pipe(\n          Match.tag('RequestedOpen', () => ({})),",
      },
    ],
    tests: [bundles],
  },
  {
    name: 'a Sheet already open moves to its opening point on another open request',
    edits: [
      {
        file: '../src/sheet.ts',
        find: "        updateDialog(model.dialog, message),\n        Match.value(message).pipe(\n          Match.tag('RequestedOpen', () => (model.dialog.isOpen ? {} : { at: model.opensAt })),",
        replace:
          "        updateDialog(model.dialog, message),\n        Match.value(message).pipe(\n          Match.tag('RequestedOpen', () => ({ at: model.opensAt })),",
      },
    ],
    tests: [bundles],
  },
  {
    name: 'show gives a toast an id other than the one nextId named',
    edits: [
      {
        file: '../src/toast.ts',
        find: 'const id = nextId(model)',
        replace: 'const id = String(model.next + 1)',
      },
    ],
    tests: [stack],
  },
]
