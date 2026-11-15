/**
 * The formatting toolbar, each part broken in turn: `pnpm mutate
 * packages/mixins-richtext/test/formatting.mutations.ts` checks that a test fails for every one.
 */
const file = '../src/formatting.ts'
const unit = 'packages/mixins-richtext/test/formatting.test.ts'
const browser = 'packages/mixins-richtext/test/formatting.browser.test.ts'

export default [
  {
    name: 'an unavailable control still sends',
    edits: [
      {
        file,
        find: '...(made.available ? [h.OnClick(made.press)] : []),',
        replace: 'h.OnClick(made.press),',
      },
    ],
    tests: [browser],
  },
  {
    name: 'the tab stop is always the first control',
    edits: [{ file, find: 'const stop = stopped === -1 ? 0 : stopped', replace: 'const stop = 0' }],
    tests: [unit, browser],
  },
  {
    name: 'the caret’s stored format is ignored',
    edits: [
      { file, find: 'storedMarks: input.storedMarks ?? null,', replace: 'storedMarks: null,' },
    ],
    tests: [unit],
  },
  {
    name: 'a mark reads pressed when it is not',
    edits: [
      {
        file,
        find: 'pressed: markActive(state, item.mark),',
        replace: 'pressed: !markActive(state, item.mark),',
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'link is offered without text',
    edits: [
      {
        file,
        find: 'available: RichText.coversText(input.selection),',
        replace: 'available: hasSelection,',
      },
    ],
    tests: [unit],
  },
  {
    name: 'undo ignores what the caller says is available',
    edits: [{ file, find: 'available: history.undo,', replace: 'available: true,' }],
    tests: [unit],
  },
  {
    name: 'the arrows stop at the ends',
    edits: [
      {
        file,
        find: "{ orientation: 'horizontal', loop: true, direction: input.direction ?? 'ltr' }",
        replace: "{ orientation: 'horizontal', loop: false, direction: input.direction ?? 'ltr' }",
      },
    ],
    tests: [browser],
  },
  {
    name: 'Escape closes the menu but leaves focus in it',
    edits: [
      {
        file,
        find: 'Option.some(Behaviors.Keys.focus(at(inMenu), input.toggled(inMenu, false)))',
        replace: 'Option.some(input.toggled(inMenu, false))',
      },
    ],
    tests: [browser],
  },
  {
    name: 'Down on an open menu does not enter it',
    edits: [
      {
        file,
        find: ': Option.some(Behaviors.Keys.focus(first, input.onFocus(menu)))',
        replace: ': Option.none()',
      },
    ],
    tests: [browser],
  },
  {
    name: 'a menu opens for a trigger that is unavailable',
    edits: [
      {
        file,
        find: 'const opened = open(menu) && describe(control).available',
        replace: 'const opened = open(menu)',
      },
    ],
    tests: [unit],
  },
] satisfies ReadonlyArray<{
  name: string
  edits: ReadonlyArray<{ file: string; find: string; replace: string }>
  tests: ReadonlyArray<string>
}>
