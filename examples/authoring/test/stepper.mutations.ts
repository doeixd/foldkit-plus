/**
 * The stepper, broken in turn: `pnpm mutate
 * examples/authoring/test/stepper.mutations.ts`.
 */
const app = '../src/stepper/app.ts'
const view = '../src/stepper/view.ts'
const unit = 'examples/authoring/test/stepper.test.ts'
const page = 'examples/authoring/test/stepper.browser.test.ts'

export default [
  {
    name: 'a hold never speeds up',
    edits: [{ file: app, find: 'count <= SLOW_STEPS ? 1 : FAST_STRIDE', replace: '1' }],
    tests: [unit],
  },
  {
    name: 'the value is not clamped to its bounds',
    edits: [{ file: app, find: 'Math.min(MAX, Math.max(MIN, value))', replace: 'value' }],
    tests: [unit, page],
  },
  {
    name: 'reaching a bound does not stop the hold',
    edits: [{ file: app, find: 'atBound ? [liftCommand(StopRepeat())] : []', replace: '[]' }],
    tests: [unit],
  },
  {
    name: 'the less button steps up',
    edits: [{ file: app, find: 'onOut: folding(-1)', replace: 'onOut: folding(1)' }],
    tests: [unit, page],
  },
  {
    name: 'a button at its bound is disabled while it is still held',
    edits: [{ file: view, find: ' && !model.more.holding', replace: '' }],
    tests: [unit, page],
  },
  {
    name: 'the pointer leaving the button does not end the hold',
    edits: [
      {
        file: '../../../packages/primitives/src/interaction/press.ts',
        find: "'pointerleave',",
        replace: "'pointerleave-never',",
      },
    ],
    tests: [page],
  },
  {
    name: 'a released key does not end the hold',
    edits: [
      {
        file: '../../../packages/primitives/src/interaction/press.ts',
        find: "'keyup',",
        replace: "'keyup-never',",
      },
    ],
    tests: [page],
  },
]
