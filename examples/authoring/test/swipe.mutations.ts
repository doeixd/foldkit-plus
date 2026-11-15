/**
 * The swipeable row, broken in turn: `pnpm mutate
 * examples/authoring/test/swipe.mutations.ts`.
 */
const app = '../src/swipe/app.ts'
const view = '../src/swipe/view.ts'
const swipeActions = '../../../packages/primitives/src/interaction/swipe-actions.ts'
const unit = 'examples/authoring/test/swipe.test.ts'
const page = 'examples/authoring/test/swipe.browser.test.ts'

export default [
  {
    name: 'the start side has no room to open into',
    edits: [{ file: app, find: 'startWidth: ACTION_SHARE * width', replace: 'startWidth: 0' }],
    tests: [unit, page],
  },
  {
    name: 'a long swipe runs the first action of the wrong side',
    edits: [{ file: app, find: 'actionsOn(fact.side)[0]!', replace: "actionsOn('end')[0]!" }],
    tests: [unit],
  },
  {
    name: 'a pressed action leaves the row open',
    edits: [
      {
        file: app,
        find: 'Acted: ({ action }) => closeRow(modifyFields(model, { done: () => Option.some(action) })),',
        replace:
          'Acted: ({ action }) => ({ model: modifyFields(model, { done: () => Option.some(action) }) }),',
      },
    ],
    tests: [unit, page],
  },
  {
    name: 'focus leaving does not close the row',
    edits: [
      {
        file: app,
        find: 'FocusLeft: () => (Option.isNone(model.row.open) ? { model } : closeRow(model)),',
        replace: 'FocusLeft: () => ({ model }),',
      },
    ],
    tests: [unit, page],
  },
  {
    name: 'a cancelled swipe is let go as if it were finished',
    edits: [{ file: app, find: 'if (!completed) return { model: dropped }', replace: '' }],
    tests: [unit],
  },
  {
    name: 'the dragged offset starts from the wrong side',
    edits: [
      {
        file: app,
        find: "onSome: side => (side === 'start' ? 1 : -1) * ACTION_SHARE * width,",
        replace: "onSome: side => (side === 'start' ? -1 : 1) * ACTION_SHARE * width,",
      },
    ],
    tests: [unit],
  },
  {
    name: 'the actions behind a closed row can be tabbed to',
    edits: [
      {
        file: view,
        find: "h.Inert(!Option.contains(open, 'end')),",
        replace: 'h.Inert(false),',
      },
    ],
    tests: [unit, page],
  },
  {
    name: 'the arrows reveal the opposite sides',
    edits: [{ file: view, find: 'rtl: false,', replace: 'rtl: true,' }],
    tests: [page],
  },
  {
    name: 'focus is not handed back to the face when the row closes',
    edits: [
      {
        file: view,
        find: "parts: { action: [{ part: 'face' }], face: [] },",
        replace: 'parts: { face: [] },',
      },
    ],
    tests: [page],
  },
  {
    name: 'focus moving out of the row is never heard',
    edits: [{ file: view, find: 'Behavior.attach(Leaves),', replace: '' }],
    tests: [page],
  },
  {
    name: 'Escape on a closed row is taken',
    edits: [
      {
        file: swipeActions,
        find: 'return Option.isSome(open)',
        replace: 'return true || Option.isSome(open)',
      },
    ],
    tests: [page],
  },
  {
    name: 'a flick is read by its distance alone',
    edits: [
      {
        file: swipeActions,
        find: 'if (Math.abs(release.velocityX) > args.flick) {',
        replace: 'if (false) {',
      },
    ],
    tests: [unit, page],
  },
]
