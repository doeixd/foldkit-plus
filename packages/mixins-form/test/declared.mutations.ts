/**
 * `foldkit-mixins-form/declared`, a form drawn from `Declared.of(form)`,
 * broken in turn: `pnpm mutate packages/mixins-form/test/declared.mutations.ts`.
 */
const file = '../src/declared.ts'
const unit = 'packages/mixins-form/test/declared.test.ts'
const browser = 'packages/mixins-form/test/declared.browser.test.ts'

const edit = (
  name: string,
  find: string,
  replace: string,
  tests: ReadonlyArray<string> = [unit, browser],
) => ({ name, edits: [{ file, find, replace }], tests })

export default [
  edit(
    'the day is a text input, so no date picker opens',
    "attrs: { ...context.attrs, type: 'date' }",
    'attrs: { ...context.attrs }',
  ),
  edit(
    'the date input takes no bounds',
    "      text(limited({ ...context, attrs: { ...context.attrs, type: 'date' } })),",
    "      text({ ...context, attrs: { ...context.attrs, type: 'date' } }),",
  ),
  edit(
    'the amount input takes no bounds',
    "      text(\n        limited({\n          ...context,\n          attrs: { ...context.attrs, inputMode: context.attrs.inputMode ?? 'decimal' },\n        }),\n      ),",
    "      text({\n        ...context,\n        attrs: { ...context.attrs, inputMode: context.attrs.inputMode ?? 'decimal' },\n      }),",
  ),
  edit(
    'the amount shows the plain keypad whatever the declaration says',
    "inputMode: context.attrs.inputMode ?? 'decimal'",
    "inputMode: 'text'",
  ),
  edit(
    'a number key takes no bounds',
    'Number: context => number(limited(context)),',
    'Number: context => number(context),',
    [unit],
  ),
  edit(
    'no step is put on an input',
    '        ...(attrs.step === undefined ? [] : [h.Step(attrs.step)]),\n',
    '',
  ),
  edit(
    'no maximum is put on an input',
    '        ...(attrs.max === undefined ? [] : [h.Max(attrs.max)]),\n',
    '',
  ),
  edit(
    'no minimum is put on an input',
    '        ...(attrs.min === undefined ? [] : [h.Min(attrs.min)]),\n',
    '',
  ),
  edit(
    'the declared constraints are not read for a key’s attributes',
    'const derived = Object.hasOwn(constraints, key) ? constraints[key]?.attributes : undefined',
    'const derived = undefined as DeclaredAttributes | undefined',
  ),
  edit(
    'the attrs a caller gives lose to the declared ones',
    '      ...(Object.hasOwn(own, key) ? own[key] : {}),\n',
    '',
    [unit],
  ),
  edit(
    'a key the caller gives attrs and the declaration says nothing of gets none',
    'new Set([...Object.keys(constraints), ...Object.keys(own)])',
    'new Set(Object.keys(constraints))',
    [unit],
  ),
  edit(
    'the form is read through its own field, so a rule over several keys shows nowhere',
    '  form: { ...form, field: declared.field },',
    '  form,',
  ),
  edit(
    'the renderers given are not the ones the declared kinds are drawn with',
    'renderers: { ...options.renderers, ...renderersOver(options.renderers) },',
    'renderers: { ...options.renderers, ...renderersOver() },',
    [unit],
  ),
  edit(
    'the renderers given for the other kinds are dropped',
    'renderers: { ...options.renderers, ...renderersOver(options.renderers) },',
    'renderers: renderersOver(options.renderers),',
    [unit],
  ),
  edit(
    'renderers with no Text are taken, and fail when a key is drawn',
    '    if (renderer === undefined)\n',
    '    if (false)\n',
    [unit],
  ),
]
