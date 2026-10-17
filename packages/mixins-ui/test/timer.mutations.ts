/**
 * The timer, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/timer.mutations.ts` checks that a
 * test fails for every one.
 */
const unit = 'packages/mixins-ui/test/timer.test.ts'
const browser = 'packages/mixins-ui/test/timer.browser.test.ts'

export default [
  {
    name: 'a pause drops the time since the last tick',
    edits: [
      {
        file: '../src/timer.ts',
        find: 'model.elapsed + Math.max(0, at - since)',
        replace: 'model.elapsed',
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'a tick of an older turn counts',
    edits: [{ file: '../src/timer.ts', find: 'turn !== model.turn', replace: 'false' }],
    tests: [unit],
  },
  {
    name: 'a countdown shows the second that is running out as gone',
    edits: [
      {
        file: '../src/timer.ts',
        find: "options.units ?? ['hours', 'minutes', 'seconds'],\n    model.countdown,",
        replace: "options.units ?? ['hours', 'minutes', 'seconds'],\n    false,",
      },
    ],
    tests: [unit],
  },
  {
    name: 'the primary press is a new element for each thing it says',
    edits: [
      {
        file: '../src/timer.ts',
        find: "h.Key(action === 'reset' ? 'reset' : 'primary')",
        replace: 'h.Key(action)',
      },
    ],
    tests: [browser],
  },
  {
    name: 'a countdown waits a whole interval from a late tick',
    edits: [
      {
        file: '../src/timer.ts',
        find: 'into || model.interval',
        replace: 'model.interval',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a countdown runs past its end',
    edits: [
      {
        file: '../src/timer.ts',
        find: 'return reached(model, elapsed)\n',
        replace: 'return false\n',
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'a running timer asks for no next tick',
    edits: [
      {
        file: '../src/timer.ts',
        find: 'commands: [Tick({ turn, milliseconds: untilChange(next) })]',
        replace: 'commands: []',
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'a reset keeps the time',
    edits: [
      {
        file: '../src/timer.ts',
        find: ': { model: standing(model, 0) }',
        replace: ': { model: standing(model, model.elapsed) }',
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'a paused time is drawn as a running one',
    edits: [
      {
        file: '../src/recipes/timer.ts',
        find: 'Style.nest(\'[data-state="paused"] > &\', { color: ref.text.muted }),',
        replace: '',
      },
    ],
    tests: [browser],
  },
  {
    name: 'reset is held by `disabled`, which drops the focus',
    edits: [
      {
        file: '../src/timer.ts',
        find: ': [h.AriaDisabled(true)]),',
        replace: ': [h.Disabled(true)]),',
      },
    ],
    tests: [unit, browser],
  },
]
