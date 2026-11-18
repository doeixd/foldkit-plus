/**
 * `Picker.view` over a `Choice`, `Picker.configure` and `Bundles.Picker`,
 * broken in turn:
 * `pnpm mutate packages/mixins-ui/test/pickerOptions.mutations.ts`.
 */
const unit = ['packages/mixins-ui/test/pickerOptions.test.ts']
const browser = ['packages/mixins-ui/test/pickerOptions.browser.test.ts']
const picker = '../src/picker.ts'
const bundle = '../src/bundles/picker.ts'

const one = (
  name: string,
  file: string,
  find: string,
  replace: string,
  tests: ReadonlyArray<string>,
) => ({ name, edits: [{ file, find, replace }], tests })

export default [
  one(
    'the opener’s name leaves out what is chosen',
    picker,
    "const named = summary === '' ? options.label : `${options.label}: ${summary}`",
    'const named = options.label',
    unit,
  ),
  one(
    'the `items` given are ignored',
    picker,
    'const items = options.items ?? choice.items',
    'const items = choice.items',
    unit,
  ),
  one(
    'a chosen item the offered rows lack is not named',
    picker,
    'chosen.map(item => rows.get(item) ?? rowOf(item))',
    'chosen.flatMap(item => rows.get(item) ?? [])',
    unit,
  ),
  one(
    'the opener does not say invalid',
    picker,
    '...(options.invalid === true ? [h.AriaInvalid(true)] : []),',
    '',
    unit,
  ),
  one(
    'a disabled opener still opens the Sheet',
    picker,
    '...(options.disabled === true\n        ? [h.AriaDisabled(true)]\n        : [h.OnClick(onMessage(Message.OpenedSheet()))]),',
    '...[\n        ...(options.disabled === true ? [h.AriaDisabled(true)] : []),\n        h.OnClick(onMessage(Message.OpenedSheet())),\n      ],',
    browser,
  ),
  one(
    'the clear button is drawn with nothing chosen',
    picker,
    'const clearable = clear !== undefined && chosen.length > 0 && options.disabled !== true',
    'const clearable = clear !== undefined && options.disabled !== true',
    unit,
  ),
  one(
    'a disabled picker keeps its clear button',
    picker,
    'const clearable = clear !== undefined && chosen.length > 0 && options.disabled !== true',
    'const clearable = clear !== undefined && chosen.length > 0',
    unit,
  ),
  one(
    'the Sheet’s rows are not grouped',
    picker,
    'if (groupBy === undefined) return',
    'if (true) return',
    browser,
  ),
  one(
    'a disabled Sheet row takes a press',
    picker,
    '...(row.disabled === true\n            ? [h.AriaDisabled(true)]\n            : [h.OnClick(onMessage(Message.ChoseInSheet({ value: item })))]),',
    '...[\n            ...(row.disabled === true ? [h.AriaDisabled(true)] : []),\n            h.OnClick(onMessage(Message.ChoseInSheet({ value: item }))),\n          ],',
    browser,
  ),
  one(
    'a group’s heading is not drawn',
    picker,
    '...(heading === undefined\n            ? []\n            : [h.div(builders.heading.attrs([h.Id(headingId)]), [heading(name)])]),',
    '',
    browser,
  ),
  one(
    'the phone half is not the style’s to hide',
    picker,
    'h.div(builders.phone.attrs(), [',
    'h.div([], [',
    browser,
  ),
  one(
    'a choice is reported as a clearing',
    bundle,
    'Chose: ({ value }) => ChoiceChange.Selected({ value }),',
    'Chose: () => ChoiceChange.ClearedSelection(),',
    unit,
  ),
  one(
    'the Sheet’s animation arg is dropped',
    bundle,
    '...(animated === undefined ? {} : { isAnimated: animated })',
    '',
    unit,
  ),
]
