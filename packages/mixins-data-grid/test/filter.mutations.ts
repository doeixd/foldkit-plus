/**
 * The filter form as drawn, each rule broken in turn: `pnpm mutate
 * packages/mixins-data-grid/test/filter.mutations.ts` checks that a test fails
 * for every one.
 *
 * Two guards are doubled on purpose and survive alone: the clipboard box off
 * while a form is open (the update refuses the paste as well, so a cut there
 * changes nothing either way), and the header row's listener ignoring a press
 * in the form (a press without a move starts no drag, and a test of a drag
 * begun in a form field is a pointer race the browser tests do not run).
 */
const view = '../src/view.ts'
const form = '../src/filterForm.ts'
const unit = ['packages/mixins-data-grid/test/filter.test.ts']
const browser = ['packages/mixins-data-grid/test/filter.browser.test.ts']
const one = (
  name: string,
  file: string,
  find: string,
  replace: string,
  tests: ReadonlyArray<string>,
) => ({ name, edits: [{ file, find, replace }], tests })

export default [
  one(
    'Escape on the grid moves off the header before it closes the form',
    view,
    "          if (key === 'Escape' && Option.isSome(state.filtering)) {",
    "          if (key === 'Escape' && Option.isSome(state.filtering) && false) {",
    unit,
  ),
  one(
    'Alt+ArrowDown opens no filter',
    view,
    "          if (key === 'ArrowDown' && modifiers.altKey && Option.isSome(filterOf(column))) {",
    "          if (key === 'ArrowDown' && modifiers.altKey && Option.isSome(filterOf(column)) && false) {",
    unit,
  ),
  one(
    'a header is named by its content',
    view,
    '              // Named by its own words: the buttons and an open form inside are not its name.\n              h.AriaLabel(grid.columns.byId[id].header),\n',
    '',
    browser,
  ),
  one(
    'a filtered header says nothing',
    view,
    "                    h.AriaDescription(filterWords.filtered ?? 'Filtered'),\n",
    '',
    unit,
  ),
  one(
    'a stale frame draws the old form',
    view,
    '                      form: Option.isSome(stale) ? formOf(drawn) : form,',
    '                      form,',
    unit,
  ),
  one(
    'focus leaving the header leaves the form open',
    view,
    '                ? [h.OnFocusLeave(input.wrap(grid.Message.FilterClosed()))]',
    '                ? []',
    browser,
  ),
  one(
    'a bound is never marked',
    form,
    '          h.AriaInvalid(Option.isSome(error)),',
    '          h.AriaInvalid(false),',
    unit,
  ),
  one(
    'crossed bounds mark the lower too',
    form,
    "    return reading.crossed && (field === 'max' || field === 'to')",
    '    return reading.crossed',
    unit,
  ),
  one(
    'the first field takes no focus',
    form,
    '          ...(first ? [args.hold] : []),',
    '',
    browser,
  ),
  one('Clear is drawn with no filter', form, '      ...(args.filtered', '      ...(true', unit),
]
