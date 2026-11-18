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
        find: '              h.AriaDisabled(!made.available),\n              ...(made.available ? [h.OnClick(made.press)] : []),',
        replace:
          '              h.AriaDisabled(!made.available),\n              h.OnClick(made.press),',
      },
    ],
    tests: [browser],
  },
  {
    name: 'the tab stop is always the first control',
    edits: [{ file, find: 'const stop = stopOf(input, controls)', replace: 'const stop = 0' }],
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
  {
    name: 'an editor entry of the insert menu is sent without wrap',
    edits: [
      {
        file,
        find: 'Editor: ({ entry }) => ({ ...entry, message: input.wrap(entry.message) }),',
        replace: 'Editor: ({ entry }) => ({ ...entry, message: entry.message as never }),',
      },
    ],
    tests: [unit],
  },
  {
    name: 'an application control sends while disabled',
    edits: [{ file, find: 'available: own.disabled !== true,', replace: 'available: true,' }],
    tests: [unit, browser],
  },
  {
    name: 'ArrowDown on an application menu trigger does nothing',
    edits: [
      {
        file,
        find: "if (own?.popup?.kind === 'menu' &&",
        replace: "if (false && own?.popup?.kind === 'menu' &&",
      },
    ],
    tests: [browser],
  },
  {
    name: 'Escape from a control returns nowhere',
    edits: [
      {
        file,
        find: 'return input.returned === undefined ? Option.none() : Option.some(input.returned)',
        replace: 'return Option.none()',
      },
    ],
    tests: [browser],
  },
  {
    name: 'an application popup that is open reads as closed',
    edits: [{ file, find: 'expanded: own.popup.open }', replace: 'expanded: false }' }],
    tests: [unit],
  },
  {
    name: 'a compact bar still draws the low controls',
    edits: [{ file, find: '(input.compact === true ? [] : [item.low])', replace: '[item.low]' }],
    tests: [unit, browser],
  },
  {
    name: 'a compact bar draws no More button',
    edits: [
      {
        file,
        find: "  return overflowOf(input).length === 0 ? ended : [...ended, 'more']",
        replace: '  return ended',
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'the More menu lists a control that opens a popup of its own',
    edits: [
      {
        file,
        find: "typeof item === 'object' && 'low' in item && !opensPopup(item.low) ? [item.low] : [],",
        replace: "typeof item === 'object' && 'low' in item ? [item.low] : [],",
      },
    ],
    tests: [unit],
  },
  {
    name: 'a toggle in the More menu is a plain item, not a checkbox',
    edits: [
      {
        file,
        find: "h.Role(made.pressed === undefined ? 'menuitem' : 'menuitemcheckbox'),",
        replace: "h.Role('menuitem'),",
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'an unavailable row of the More menu still sends',
    edits: [
      {
        file,
        find: "h.DataAttribute('more', control.id),\n                  ...(made.available ? [h.OnClick(made.press)] : []),",
        replace: "h.DataAttribute('more', control.id),\n                  h.OnClick(made.press),",
      },
    ],
    tests: [unit],
  },
  {
    name: 'the arrows do not enter the More menu',
    edits: [
      {
        file,
        find: "const inMenu = (['style', 'insert', 'more'] as const).find(",
        replace: "const inMenu = (['style', 'insert'] as const).find(",
      },
    ],
    tests: [browser],
  },
  {
    name: 'a hidden current control sends the tab stop to the first',
    edits: [
      {
        file,
        find: 'const at = shown.findIndex(control => control.id === near?.id)',
        replace: 'const at = -1',
      },
    ],
    tests: [unit],
  },
  {
    name: 'separators stack up where a group is hidden',
    edits: [{ file, find: "drawn[drawn.length - 1] !== 'separator'", replace: 'true' }],
    tests: [unit],
  },
  {
    name: 'a separator is left at the end',
    edits: [
      {
        file,
        find: "tidy[tidy.length - 1] === 'separator' ? tidy.slice(0, -1) : tidy",
        replace: 'tidy',
      },
    ],
    tests: [unit],
  },
] satisfies ReadonlyArray<{
  name: string
  edits: ReadonlyArray<{ file: string; find: string; replace: string }>
  tests: ReadonlyArray<string>
}>
