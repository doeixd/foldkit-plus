/**
 * The Sheet's handle as a control, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/sheetHandle.mutations.ts` checks that a
 * test fails for every one.
 */
const handle = 'packages/mixins-ui/test/sheetHandle.browser.test.ts'
const unit = 'packages/mixins-ui/test/sheet.test.ts'

export default [
  {
    name: 'the handle stays decoration with points',
    edits: [
      {
        file: '../src/sheet.ts',
        find: 'interactiveHandle: snapping,',
        replace: 'interactiveHandle: false,',
      },
    ],
    tests: [handle],
  },
  {
    name: 'the handle takes no keys',
    edits: [{ file: '../src/sheet.ts', find: '...(snapping ? [keys.mixin] : []),', replace: '' }],
    tests: [handle],
  },
  {
    name: 'the handle is no separator',
    edits: [{ file: '../src/sheet.ts', find: "h.Role('separator'),", replace: '' }],
    tests: [handle],
  },
  {
    name: 'the handle is no tab stop',
    edits: [{ file: '../src/sheet.ts', find: 'h.Tabindex(0),', replace: '' }],
    tests: [handle],
  },
  {
    name: 'the handle reports the lowest point whatever it rests at',
    edits: [
      {
        file: '../src/sheet.ts',
        find: 'h.AriaValuenow(percent(model.at)),',
        replace: 'h.AriaValuenow(percent(0)),',
      },
    ],
    tests: [handle],
  },
  {
    name: 'every handle is horizontal',
    edits: [
      {
        file: '../src/sheet.ts',
        find: "h.AriaOrientation(axis === 'y' ? 'horizontal' : 'vertical'),",
        replace: "h.AriaOrientation('horizontal'),",
      },
    ],
    tests: [handle],
  },
  {
    name: 'the application cannot word the handle',
    edits: [
      {
        file: '../src/sheet.ts',
        find: "options.words?.handle ?? 'Resize sheet'",
        replace: "'Resize sheet'",
      },
    ],
    tests: [handle],
  },
  {
    name: 'a bottom sheet is raised by the key that lowers it',
    edits: [
      {
        file: '../src/sheet.ts',
        find: "model.side === 'top' || model.side === 'left' ? ascending : [...ascending].reverse()",
        replace: 'ascending',
      },
    ],
    tests: [handle],
  },
  {
    name: 'the keys wrap round the points',
    edits: [{ file: '../src/sheet.ts', find: 'loop: false,', replace: 'loop: true,' }],
    tests: [handle],
  },
  {
    name: 'Home goes to the highest point',
    edits: [{ file: '../src/sheet.ts', find: "key === 'Home'", replace: "key === 'End'" }],
    tests: [handle],
  },
  {
    name: 'the ring is gone from the handle',
    edits: [{ file: '../src/recipes/sheet.ts', find: '        focusRing,\n', replace: '' }],
    tests: [handle],
  },
  {
    name: 'a handle of a single point is no longer hidden',
    edits: [
      {
        file: '../src/dialog.ts',
        find: 'handle: context.interactiveHandle === true ? [] : [h.AriaHidden(true)],',
        replace: 'handle: [],',
      },
    ],
    tests: [handle],
  },
  {
    name: 'a point it has not got is taken',
    edits: [
      {
        file: '../src/sheet.ts',
        find: '!Number.isInteger(at) || at < 0 || at >= model.points.length',
        replace: 'false',
      },
    ],
    tests: [unit],
  },
  {
    name: 'the point it is at is a change',
    edits: [{ file: '../src/sheet.ts', find: 'at === model.at || ', replace: '' }],
    tests: [unit],
  },
]
