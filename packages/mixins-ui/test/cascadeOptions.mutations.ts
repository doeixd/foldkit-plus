/**
 * What `CascadeSelect` gained (words, `clear`, a row's content, `triggerText`,
 * `Set`, the inline panel) and `Bundles.CascadeSelect`, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/cascadeOptions.mutations.ts`.
 */
const unit = ['packages/mixins-ui/test/cascadeOptions.test.ts']
const browser = ['packages/mixins-ui/test/cascadeOptions.browser.test.ts']
const select = '../src/cascadeSelect.ts'
const bundle = '../src/bundles/cascadeSelect.ts'
const recipe = '../src/recipes/cascadeSelect.ts'

const one = (
  name: string,
  file: string,
  find: string,
  replace: string,
  tests: ReadonlyArray<string>,
) => ({ name, edits: [{ file, find, replace }], tests })

export default [
  one(
    'the placeholder word is not the default',
    select,
    'options.placeholder ?? said.placeholder',
    "options.placeholder ?? 'Select…'",
    unit,
  ),
  one('the back word is not filled', select, 'fill(said.back, {', 'String(said.back, {', unit),
  one(
    'the clear button is drawn with nothing chosen',
    select,
    'options.clear !== undefined && Option.isSome(model.value) && !disabled',
    'options.clear !== undefined && !disabled',
    unit,
  ),
  one(
    'a mark of the application’s own gets the cross as well',
    select,
    "...(options.clear === true ? [h.DataAttribute('glyph', 'cross')] : []),",
    "h.DataAttribute('glyph', 'cross'),",
    unit,
  ),
  one('a row’s description is not drawn', select, 'parts.description === undefined', 'true', unit),
  one('a row’s trailing part is not drawn', select, 'parts.trailing === undefined', 'true', unit),
  one('a row’s icon is not drawn', select, 'parts.icon === undefined', 'true', unit),
  one(
    'the trigger’s text is the joined labels whatever `triggerText` says',
    select,
    'options.triggerText === undefined',
    'true',
    unit,
  ),
  one(
    'Set chooses a parent that is not an option',
    select,
    'reachable(path) && (choosesParents || !hasChildren(node))',
    'reachable(path)',
    unit,
  ),
  one(
    'Set chooses a node that cannot be reached',
    select,
    'return node !== undefined && reachable(path) &&',
    'return node !== undefined &&',
    unit,
  ),
  one(
    'Set of the value it holds makes a new Model',
    select,
    'return same ? { model } : { model: modifyFields(model, { value: () => next }) }',
    'return { model: modifyFields(model, { value: () => next }) }',
    unit,
  ),
  one(
    'Set of no path keeps the value',
    select,
    'const next = path.length === 0 ? Option.none<ReadonlyArray<string>>() : Option.some(path)',
    'const next = Option.some(path)',
    unit,
  ),
  one(
    'an inline panel closes',
    select,
    'config.inline === true ? { model } : closed(model, focus)',
    'closed(model, focus)',
    unit,
  ),
  one(
    'an inline panel draws a trigger',
    select,
    '...(inline ? [] : [trigger]),',
    '...[trigger],',
    unit,
  ),
  one(
    'an inline panel starts closed',
    select,
    'open: options.inline === true,',
    'open: false,',
    unit,
  ),
  one(
    'the Bundle forgets the starting value',
    bundle,
    'init({ id, value, inline: config.inline })',
    'init({ id, inline: config.inline })',
    unit,
  ),
  one(
    'the Bundle forgets the inline option',
    bundle,
    'init({ id, value, inline: config.inline })',
    'init({ id, value })',
    unit,
  ),
  one(
    'the Bundle reports nothing',
    bundle,
    '...(moved ? { outMessage: OutMessage.Changed({ value: result.model.value }) } : {}),',
    '',
    unit,
  ),
  one(
    'the Bundle reports a pick that moves nothing',
    bundle,
    '...(moved ? {',
    '...(true ? {',
    unit,
  ),
  one(
    'an inline panel is out of the tab order',
    select,
    'h.Tabindex(0)',
    'h.Tabindex(-1)',
    browser,
  ),
  one(
    'a description stands on the label’s line',
    recipe,
    "display: 'grid', flex: '1', minInlineSize: '0'",
    "display: 'block', flex: '1', minInlineSize: '0'",
    browser,
  ),
]
