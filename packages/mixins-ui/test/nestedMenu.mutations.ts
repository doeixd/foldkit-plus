/**
 * The nested menu, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/nestedMenu.mutations.ts` checks that
 * a test fails for every one.
 */
const unit = 'packages/mixins-ui/test/nestedMenu.test.ts'
const browser = 'packages/mixins-ui/test/nestedMenu.browser.test.ts'

export default [
  {
    name: 'a submenu opens below its row',
    edits: [
      {
        file: '../src/nestedMenu.ts',
        find: "anchor: { placement: 'right-start', gap: 8, padding: 8, portal: false },",
        replace: "anchor: { placement: 'bottom-start', gap: 8, padding: 8, portal: false },",
      },
    ],
    tests: [browser],
  },
  {
    name: 'ArrowRight opens the submenu with no row active',
    edits: [
      {
        file: '../src/nestedMenu.ts',
        find: 'onSome: index => opened(model, index, Option.some(0)),',
        replace: 'onSome: index => opened(model, index, Option.none()),',
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'closing a submenu leaves focus where it was',
    edits: [
      {
        file: '../src/nestedMenu.ts',
        find: 'commands: [...shut.commands, ...ofMenu(result), ...focusPanel(model)],',
        replace: 'commands: [...shut.commands, ...ofMenu(result)],',
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'the pointer resting on a row opens nothing',
    edits: [
      {
        file: '../src/nestedMenu.ts',
        find: 'onSome: () => opened(model, row, Option.none()),',
        replace: 'onSome: () => ({ model }),',
      },
    ],
    tests: [unit, browser],
  },
]
