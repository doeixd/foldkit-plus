/**
 * The toolbar example, broken in turn:
 * `pnpm mutate examples/widgets/test/toolbar.mutations.ts` checks that a test
 * fails for every one.
 */
const tests = ['examples/widgets/test/toolbar.test.ts']
const browser = ['examples/widgets/test/toolbar.browser.test.ts']

export default [
  {
    name: 'pressing reports the wrong tool',
    edits: [
      {
        file: '../src/toolbar/app.ts',
        find: 'model: modifyFields(model, { active: () => Option.some(message.id) }),',
        replace: 'model: modifyFields(model, { active: () => Option.none() }),',
      },
    ],
    tests,
  },
  {
    name: 'the disabled tool is drawn on',
    edits: [
      {
        file: '../src/toolbar/view.ts',
        find: 'disabled: control.disabled,',
        replace: 'disabled: false,',
      },
    ],
    tests,
  },
  {
    name: 'pressed state reads backwards',
    edits: [
      {
        file: '../src/toolbar/view.ts',
        find: 'pressed: Option.exists(model.active, active => active === tool.id),',
        replace: 'pressed: !Option.exists(model.active, active => active === tool.id),',
      },
    ],
    tests,
  },
  {
    name: 'the tab stop ignores where focus was',
    edits: [
      {
        file: '../src/toolbar/view.ts',
        find: 'roving: model.toolbarFocus,',
        replace: 'roving: { current: null },',
      },
    ],
    tests,
  },
  {
    name: 'a pressed tool keeps the neutral toggle fill of the Button recipe',
    edits: [
      {
        file: '../src/toolbar/view.ts',
        find: 'Recipes.Button.extend({ base: { button: pressedTool } })(',
        replace: 'Recipes.Button(',
      },
    ],
    tests: browser,
  },
  {
    name: 'a tool is drawn with a line and a fill at rest, as the outline Button',
    edits: [
      {
        file: '../src/toolbar/view.ts',
        find: "variant: 'ghost'",
        replace: "variant: 'solid'",
      },
    ],
    tests: browser,
  },
]
