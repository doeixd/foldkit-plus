/**
 * `Listbox.view` and `configure`, `Bundles.Listbox`, and what they added to
 * the adapter, the fork and the recipe, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/listboxOptions.mutations.ts`.
 */
const unit = ['packages/mixins-ui/test/listboxOptions.test.ts']
const browser = ['packages/mixins-ui/test/listboxOptions.browser.test.ts']
const view = '../src/listbox/view.ts'
const bundle = '../src/bundles/listbox.ts'
const shared = '../src/listboxShared.ts'
const adapter = '../src/listbox.ts'
const recipe = '../src/recipes/listbox.ts'

const one = (
  name: string,
  file: string,
  find: string,
  replace: string,
  tests: ReadonlyArray<string>,
) => ({ name, edits: [{ file, find, replace }], tests })

export default [
  one(
    'the trigger’s name leaves out what is chosen',
    view,
    "ariaLabel: summary === '' ? options.label : `${options.label}: ${summary}`,",
    'ariaLabel: options.label,',
    unit,
  ),
  one(
    'a chosen item the offered rows lack is not shown',
    view,
    'chosen.map(item => rows.get(item) ?? rowOf(item))',
    'chosen.flatMap(item => rows.get(item) ?? [])',
    unit,
  ),
  one(
    'the `items` given are ignored',
    view,
    'const offered = options.items ?? choice.items',
    'const offered = choice.items',
    unit,
  ),
  one(
    'a disabled row takes a press',
    view,
    'isItemDisabled: (item: string) => rows.get(item)?.disabled === true,',
    'isItemDisabled: () => false,',
    unit,
  ),
  one('the groups are not drawn', view, '...(options.groupBy === undefined', '...(true', unit),
  one(
    'the clear button is drawn with nothing chosen',
    view,
    'chosen.length > 0 &&\n    options.disabled !== true',
    'options.disabled !== true',
    unit,
  ),
  one(
    'a disabled listbox keeps its clear button',
    view,
    'options.disabled !== true &&\n    options.readOnly !== true',
    'options.readOnly !== true',
    unit,
  ),
  one(
    'a read-only listbox keeps its clear button',
    view,
    'options.disabled !== true &&\n    options.readOnly !== true',
    'options.disabled !== true',
    unit,
  ),
  one(
    'the clear button’s mark is always drawn',
    view,
    "...(clear.content === undefined ? [h.DataAttribute('glyph', 'cross')] : []),",
    "h.DataAttribute('glyph', 'cross'),",
    unit,
  ),
  one(
    'the clear button is named by nothing',
    view,
    'h.AriaLabel(words.clear),',
    "h.AriaLabel(''),",
    unit,
  ),
  one(
    'several chosen rows show the first one’s icon',
    adapter,
    'chosen.length === 1 ? iconOf',
    'chosen.length >= 1 ? iconOf',
    unit,
  ),
  one(
    'a closed listbox submits nothing',
    shared,
    '      buttonContent,\n      hiddenInputs,\n      backdrop: undefined,',
    '      buttonContent,\n      hiddenInputs: [],\n      backdrop: undefined,',
    [...unit, ...browser],
  ),
  one(
    'a listbox of several closes at a choice',
    bundle,
    'args.multiple === true ? multiple.update(model, message)',
    'false ? multiple.update(model, message)',
    unit,
  ),
  one(
    'a choice is reported as a clearing',
    bundle,
    'outMessage: ChoiceChange.Selected({ value })',
    'outMessage: ChoiceChange.ClearedSelection()',
    unit,
  ),
  one(
    'the clear button is not in the trigger’s box',
    recipe,
    "inlineSize: 'fit-content'",
    "inlineSize: 'auto'",
    browser,
  ),
  one(
    'the clear button lies over the trigger’s text',
    recipe,
    "paddingInlineEnd: `calc(${clearSize} + ${ladder('gap')})`,",
    "paddingInlineEnd: '0',",
    browser,
  ),
  one(
    'the clear button lies over the chevron',
    recipe,
    "insetInlineEnd: `calc(${ladder('pad')} + 0.45em + ${ladder('gap')})`,",
    "insetInlineEnd: ladder('pad'),",
    browser,
  ),
  one(
    'the clear button’s corners are not concentric',
    recipe,
    'borderRadius: `max(0px, calc(${controlCorner} - 0.25em))`,',
    "borderRadius: '0',",
    browser,
  ),
]
