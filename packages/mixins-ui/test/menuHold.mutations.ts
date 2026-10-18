/**
 * A context menu held open by a finger, each part broken in turn: `pnpm mutate
 * packages/mixins-ui/test/menuHold.mutations.ts` checks that a test fails for every one.
 */
const file = '../src/menu.ts'
const tests = ['packages/mixins-ui/test/menuUpdate.test.ts']

export default [
  {
    name: 'a wander of any length is still a hold',
    edits: [{ file, find: '< HOLD_SLOP', replace: '< Infinity' }],
    tests,
  },
  {
    name: 'an earlier hold running out opens the menu',
    edits: [
      {
        file,
        find: 'Option.isSome(model.holding) && hold === model.hold',
        replace: 'Option.isSome(model.holding)',
      },
    ],
    tests,
  },
  {
    name: 'a lifted finger still holds',
    edits: [
      {
        file,
        find: '    LiftedFromTarget: () => ({ model: written(model, { holding: Option.none() }) }),',
        replace: '    LiftedFromTarget: () => ({ model }),',
      },
    ],
    tests,
  },
  {
    name: 'Android’s contextmenu leaves the hold to open it again',
    edits: [
      {
        file,
        find: 'written(model, { point: model.press, press: Option.none(), holding: Option.none() }),\n        UiMenu.Message.Opened({ maybeActiveItemIndex: Option.some(0) }),\n      ),\n  })',
        replace:
          'written(model, { point: model.press, press: Option.none() }),\n        UiMenu.Message.Opened({ maybeActiveItemIndex: Option.some(0) }),\n      ),\n  })',
      },
    ],
    tests,
  },
  {
    name: 'pointTarget records a right press alone',
    edits: [
      { file, find: "button === 2 || (button === 0 && type !== 'mouse')", replace: 'button === 2' },
    ],
    tests,
  },
]
