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
    'a refused evaluation is left undecided',
    "Option.exists(verdict.obligation, ({ kind }) => kind === 'unsupported')",
    'false',
  ),
  edit(
    'a value not entered yet is taken as refused',
    "Option.exists(verdict.obligation, ({ kind }) => kind === 'unsupported')",
    'true',
  ),
  edit(
    'a guard refused over the values entered leaves `can` Unknown',
    '      refusedIsFalse(\n        Transition.can(',
    '      (verdict => verdict)(\n        Transition.can(',
  ),
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
    "format: value => dayText(Number(value)) ?? '',",
    'format: value => String(value),',
  ),
  edit('a transition is judged without the values entered', 'input: known(model),', 'input: {},', [
    unit,
    browser,
  ]),
  edit(
    'a transition is judged without the state given',
    '...(state === undefined ? {} : { state }),',
    '',
    [unit, browser],
  ),
  edit(
    'a rule on one key is reported beside its key',
    '.filter(({ at }) => at.length === 0)',
    '.filter(() => true)',
  ),
  edit(
    'a rule still undecided is reported as broken',
    'Verdict.isFalse(refusedIsFalse(Expr.judge(failure.rule, values)))',
    '!Verdict.isTrue(Expr.judge(failure.rule, values))',
  ),
  edit(
    'a broken rule names no key',
    'onSome: paths => Arr.dedupe(paths.map(path => path[0]).filter(isKey)),',
    'onSome: () => [],',
  ),
  {
    ...edit(
      'a key read through two paths is named twice',
      'Arr.dedupe(paths.map(path => path[0]).filter(isKey))',
      'paths.map(path => path[0]).filter(isKey)',
    ),
    survives:
      'only a key holding a struct (a control backed by a Bundle) is read through two paths, and no test builds one',
  },
  edit(
    'a rule with no message and no words is let through',
    `throw new Error(`,
    'return { failure, text: "" }\n          throw new Error(',
  ),
  edit(
    'a broken rule is shown on every key',
    '.filter(({ failure }) => failure.keys.some(each => each === key))',
    '',
  ),
  edit(
    "a broken rule's message replaces the key's own errors",
    'errors: Arr.appendAll(own, said)',
    'errors: said',
  ),
  edit(
    'the given message is ignored for the fallback words',
    'Option.orElse(message, () =>',
    'Option.orElse(Option.none<string>(), () =>',
  ),
]
