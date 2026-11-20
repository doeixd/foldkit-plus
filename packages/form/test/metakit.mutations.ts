/**
 * `foldkit-form/metakit`, each step broken in turn:
 * `pnpm mutate packages/form/test/metakit.mutations.ts` checks that a test
 * fails for every one.
 */
const unit = 'packages/form/test/metakit.test.ts'
const browser = 'packages/form/test/metakit.browser.test.ts'
const file = '../src/metakit.ts'
const edit = (
  name: string,
  find: string,
  replace: string,
  tests: ReadonlyArray<string> = [unit],
) => ({ name, edits: [{ file, find, replace }], tests })

export default [
  edit(
    'an exclusive lower bound of a whole key is shown as it is',
    'n => Math.floor(n) + 1',
    'n => n',
    [unit, browser],
  ),
  edit(
    'an exclusive upper bound of a whole key is shown as it is',
    'n => Math.ceil(n) - 1',
    'n => n',
  ),
  edit(
    'a fractional lower bound of a whole key is not rounded up',
    'Option.map(spec.min, Math.ceil)',
    'spec.min',
  ),
  edit(
    'a fractional upper bound of a whole key is not rounded down',
    'Option.map(spec.max, Math.floor)',
    'spec.max',
  ),
  edit('the looser of two lower bounds stands', '          Math.max,', '          Math.min,'),
  edit('the looser of two upper bounds stands', '          Math.min,', '          Math.max,'),
  edit(
    'a key that is not whole shows its exclusive bounds as inclusive',
    'const { min, max } = bounds(spec, whole)',
    'const { min, max } = bounds(spec, true)',
  ),
  edit(
    "a number key keeps the input's default step",
    "step: Option.some('any')",
    "step: Option.some('1')",
  ),
  edit(
    'a day bound is shown as an epoch day',
    'numeric(spec, true, dayText, {',
    'numeric(spec, true, String, {',
  ),
  edit(
    'an amount bound is shown in minor units',
    'numeric(spec, true, units => unitsText(units, scale), {',
    'numeric(spec, true, String, {',
    [unit, browser],
  ),
  edit(
    'an amount steps by whole units',
    'step: Option.some(unitsText(1, scale))',
    "step: Option.some('1')",
    [unit, browser],
  ),
  edit(
    'an amount with cents asks for a numeric keyboard',
    "inputMode: Option.some(scale === 0 ? 'numeric' : 'decimal')",
    "inputMode: Option.some('numeric')",
  ),
  edit(
    'a Money key gets no amount control',
    'money: scaled => Option.some(DecimalInput.of(scaled)),',
    'money: () => Option.none(),',
    [unit, browser],
  ),
  edit(
    'a CalendarDay key gets no date control',
    'calendarDay: (): Option.Option<Control> => Option.some(CalendarDayInput.of({})),',
    'calendarDay: (): Option.Option<Control> => Option.none(),',
  ),
  edit(
    'a filled day is shown as an epoch day',
    'format: value => dayText(Number(value)),',
    'format: value => String(value),',
  ),
  edit(
    'a transition is judged without the values entered',
    'input: form.partial(model) as Expr.PartialEnv<Schema.Struct.Type<Fields>>,',
    'input: {},',
    [unit, browser],
  ),
  edit(
    'a transition is judged without the state given',
    '...(state === undefined ? {} : { state }),',
    '',
    [unit, browser],
  ),
]
