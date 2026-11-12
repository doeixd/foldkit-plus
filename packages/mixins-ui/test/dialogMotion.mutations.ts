/**
 * The Dialog's and the Sheet's `motion`, `close` and sheet-duration, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/dialogMotion.mutations.ts` checks that a
 * test fails for every one.
 */
const unit = 'packages/mixins-ui/test/sheet.test.ts'
const browser = 'packages/mixins-ui/test/dialogMotion.browser.test.ts'

export default [
  {
    name: 'motion none leaves the exit timed',
    edits: [
      {
        file: '../src/recipes/dialog.ts',
        find: "  Style.pseudo('[data-leave]', { transitionDuration: '0s' }),\n",
        replace: '',
      },
    ],
    tests: [browser],
  },
  {
    name: 'motion none stills nothing',
    edits: [
      {
        file: '../src/recipes/dialog.ts',
        find: 'none: { backdrop: still, panel: still },',
        replace: 'none: {},',
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'motion none stills the panel but not the backdrop',
    edits: [
      {
        file: '../src/recipes/dialog.ts',
        find: 'none: { backdrop: still, panel: still },',
        replace: 'none: { panel: still },',
      },
    ],
    tests: [browser],
  },
  {
    name: 'close none draws the corner button',
    edits: [
      {
        file: '../src/recipes/dialog.ts',
        find: '    close: closeAxis,\n    motion: motionAxis,\n  },\n  defaults: { size',
        replace:
          '    close: { corner: closeAxis.corner, none: closeAxis.corner },\n    motion: motionAxis,\n  },\n  defaults: { size',
      },
    ],
    tests: [unit],
  },
  {
    name: 'the sheet slides on the slow tier',
    edits: [
      {
        file: '../src/recipes/sheet.ts',
        find: 'timing(ref.motion.sheet, ref.motion.ease)',
        replace: 'timing(ref.motion.slow, ref.motion.ease)',
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'the sheet leaves on the slow exit',
    edits: [
      {
        file: '../src/recipes/sheet.ts',
        find: "timing(ref.motion['sheet-exit'], ref.motion['ease-exit'])",
        replace: "timing(ref.motion['slow-exit'], ref.motion['ease-exit'])",
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'the sheet slide travels under reduced motion',
    edits: [
      {
        file: '../src/recipes/sheet.ts',
        find: 'transitionDuration: `${duration}, ${travelled(duration)}, ${travelled(duration)}`,',
        replace: 'transitionDuration: `${duration}, ${duration}, ${duration}`,',
      },
    ],
    tests: [browser],
  },
  {
    name: 'the sheet backdrop keeps the dialog timing',
    edits: [
      {
        file: '../src/recipes/sheet.ts',
        find: 'backdrop: Style.compose(dialog.backdrop, slide),',
        replace: 'backdrop: dialog.backdrop,',
      },
    ],
    tests: [browser],
  },
  {
    name: 'the page steps back on the slow tier',
    edits: [
      {
        file: '../src/recipes/sheet.ts',
        find: 'transitionDuration: travelled(ref.motion.sheet),',
        replace: 'transitionDuration: travelled(ref.motion.slow),',
      },
    ],
    tests: [browser],
  },
  {
    name: 'the sheet token is not the slow tier by default',
    edits: [
      {
        file: '../../mixins/src/theme/tokens.ts',
        find: "sheet: 'var(--fk-motion-slow)',",
        replace: "sheet: 'var(--fk-motion-fast)',",
      },
    ],
    tests: [browser],
  },
  {
    name: 'the sheet exit token is not the slow exit by default',
    edits: [
      {
        file: '../../mixins/src/theme/tokens.ts',
        find: "'sheet-exit': 'var(--fk-motion-slow-exit)',",
        replace: "'sheet-exit': 'var(--fk-motion-fast-exit)',",
      },
    ],
    tests: [browser],
  },
]
