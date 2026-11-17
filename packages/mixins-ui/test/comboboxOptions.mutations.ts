/**
 * `Combobox.view` and `configure`, and what they added to the adapter, the
 * fork and the recipe, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/comboboxOptions.mutations.ts`.
 */
const unit = ['packages/mixins-ui/test/comboboxOptions.test.ts']
const browser = ['packages/mixins-ui/test/comboboxOptions.browser.test.ts']
const view = '../src/combobox/view.ts'
const shared = '../src/comboboxShared.ts'
const listbox = '../src/listbox.ts'
const recipe = '../src/recipes/combobox.ts'

const one = (
  name: string,
  file: string,
  find: string,
  replace: string,
  tests: ReadonlyArray<string>,
) => ({ name, edits: [{ file, find, replace }], tests })

export default [
  one(
    'every row is offered whatever the filter says',
    view,
    'if (options.filter === undefined || options.filter(row.label, typed)) offered.push(item)',
    'offered.push(item)',
    unit,
  ),
  one(
    'the filter is given the item, not its label',
    view,
    'options.filter(row.label, typed)',
    'options.filter(item, typed)',
    unit,
  ),
  one(
    'the `items` given are ignored',
    view,
    'for (const item of options.items ?? choice.items) {',
    'for (const item of choice.items) {',
    unit,
  ),
  one(
    'a row is drawn as its bare item',
    view,
    'content: drawn.option(rows.get(item) ?? { label: item }, typed),',
    'content: drawn.option({ label: item }, typed),',
    unit,
  ),
  one(
    'a row and a chip are named by the item',
    view,
    'const labelOf = (item: string): string => rows.get(item)?.label ?? item',
    'const labelOf = (item: string): string => item',
    [...unit, ...browser],
  ),
  one(
    'a disabled row takes a press',
    view,
    'isItemDisabled: (item: string) => rows.get(item)?.disabled === true,',
    'isItemDisabled: () => false,',
    unit,
  ),
  one('the field has no name', view, '    ariaLabel: options.label,\n', '', unit),
  one(
    'the rows are drawn unstyled',
    view,
    '    toView: toView(mixins, { h }),\n',
    '    toView: toView([], { h }),\n',
    unit,
  ),
  one(
    'the rows stand ungrouped',
    view,
    "itemGroupKey: (item: string) => groups.get(item) ?? '',",
    "itemGroupKey: () => '',",
    unit,
  ),
  one(
    'a group’s heading is not drawn',
    view,
    ': { groupToHeading: (group: string) => ({ content: heading(group) }) }),',
    ': {}),',
    unit,
  ),
  one('the placeholder is dropped', view, '{ inputPlaceholder: options.placeholder }', '{}', unit),
  one(
    'the default clear button is given content',
    view,
    'clearContent: clear === true ? null : clear.content',
    'clearContent: clear === true ? h.span([], []) : clear.content',
    unit,
  ),
  one(
    'chips are drawn unasked',
    view,
    'options.chips === true ? { chips: {} } : {}',
    '{ chips: {} }',
    unit,
  ),
  one('chips are never drawn', view, 'options.chips === true ? { chips: {} } : {}', '{}', unit),
  one('disabled is dropped', view, '{ isDisabled: options.disabled }', '{}', unit),
  one('invalid is dropped', view, '{ isInvalid: options.invalid }', '{}', unit),
  one('read-only is dropped', view, '{ isReadOnly: options.readOnly }', '{}', unit),
  one('the name is dropped', view, '{ formName: options.name }', '{}', unit),
  one('the words are dropped', view, '{ words: options.words }', '{}', unit),
  one(
    'a choice of several is drawn as a choice of one',
    view,
    'return choice.multiple\n',
    'return false\n',
    browser,
  ),
  one(
    'a configured Combobox draws only the call',
    view,
    'view: (options, h) => view(layered(config, options), h),',
    'view: (options, h) => view(options, h),',
    unit,
  ),
  one(
    'a closed field submits nothing',
    shared,
    '      groups: [],\n      hiddenInputs,',
    '      groups: [],\n      hiddenInputs: [],',
    unit,
  ),
  one(
    'a chip is labelled by its value',
    shared,
    'const label = itemToDisplayText(value, index)',
    'const label = value',
    unit,
  ),
  one(
    'a chip’s remove button keeps its English name',
    shared,
    'h.AriaLabel(fill(text.remove, { label })),',
    'h.AriaLabel(`Remove ${label}`),',
    unit,
  ),
  one(
    'the clear button keeps its English name',
    shared,
    'h.AriaLabel(clearLabel ?? text.clear),',
    "h.AriaLabel(clearLabel ?? 'Clear'),",
    unit,
  ),
  one(
    'the bare clear button is not marked',
    shared,
    "...(clearContent === null ? [h.DataAttribute('glyph', 'cross')] : []),",
    '',
    [...unit, ...browser],
  ),
  one(
    'a clear button with content is marked too',
    shared,
    "...(clearContent === null ? [h.DataAttribute('glyph', 'cross')] : []),",
    "h.DataAttribute('glyph', 'cross'),",
    unit,
  ),
  one(
    'a row’s own content is not drawn',
    listbox,
    'content.content !== undefined\n          ? [content.content]\n          : builders.match === undefined',
    'builders.match === undefined',
    unit,
  ),
  one(
    'a row’s trailing part is not drawn',
    listbox,
    'builders.itemTrailing === undefined || content.trailing === undefined',
    'true',
    unit,
  ),
  one(
    'the cross has one stroke',
    recipe,
    "      Style.nest('&[data-glyph=\"cross\"]::after', stroke('-45deg')),\n",
    '',
    browser,
  ),
  one(
    'the cross’s strokes lie on each other',
    recipe,
    "Style.nest('&[data-glyph=\"cross\"]::after', stroke('-45deg')),",
    "Style.nest('&[data-glyph=\"cross\"]::after', stroke('45deg')),",
    browser,
  ),
  one(
    'the cross has no ink',
    recipe,
    "'--_fk-chip-sign': 'currentColor',",
    "'--_fk-chip-sign': 'transparent',",
    browser,
  ),
]
