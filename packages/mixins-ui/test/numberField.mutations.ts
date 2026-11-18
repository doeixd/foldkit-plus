/**
 * The number field, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/numberField.mutations.ts`.
 */
const unit = ['packages/mixins-ui/test/numberField.test.ts']
const browser = ['packages/mixins-ui/test/numberField.browser.test.ts']
const view = '../src/numberField.ts'

export default [
  {
    name: 'a value is not clamped',
    edits: [
      {
        file: view,
        find: 'return Math.min(bounds.max ?? Infinity, Math.max(bounds.min ?? -Infinity, exact))',
        replace: 'return exact',
      },
    ],
    tests: [...unit, ...browser],
  },
  {
    name: 'a decimal step drifts',
    edits: [
      {
        file: view,
        find: 'const exact = Number(stepped.toFixed(places))',
        replace: 'const exact = stepped + places * 0',
      },
    ],
    tests: unit,
  },
  {
    name: 'text that is no number clears the value',
    edits: [
      { file: view, find: 'onNone: () => options.value,', replace: 'onNone: () => Option.none(),' },
    ],
    tests: browser,
  },
  {
    name: 'cleared text keeps the old value',
    edits: [{ file: view, find: "text.trim() === ''", replace: 'false' }],
    tests: browser,
  },
  {
    name: 'a group mark is kept',
    edits: [{ file: view, find: "plain = plain.replaceAll(group, '')", replace: '' }],
    tests: unit,
  },
  {
    name: 'a typed dot is no decimal in a comma locale',
    edits: [
      { file: view, find: "plain.replaceAll(mark('decimal') ?? '.', '.')", replace: 'plain' },
    ],
    tests: unit,
  },
  {
    name: 'a locale is not applied to typed text',
    edits: [{ file: view, find: 'parseNumber(text, locale))', replace: 'parseNumber(text))' }],
    tests: browser,
  },
  {
    name: 'an empty field steps down from zero, not its bound',
    edits: [{ file: view, find: "key === 'ArrowDown' || key === 'PageDown'", replace: 'false' }],
    tests: browser,
  },
  {
    name: 'a bidi mark stays in the text',
    edits: [{ file: view, find: ".replace(/\\p{Cf}/gu, '')", replace: '' }],
    tests: unit,
  },
  {
    name: 'a stepper at its bound still steps',
    edits: [
      { file: view, find: '...(disabled || readOnly || at', replace: '...(disabled || readOnly' },
    ],
    tests: unit,
  },
  {
    name: 'a read-only field still has live steppers',
    edits: [{ file: view, find: '...(disabled || readOnly || at', replace: '...(disabled || at' }],
    tests: unit,
  },
  {
    name: 'an invalid field is not marked',
    edits: [
      {
        file: view,
        find: '...(options.invalid === true ? [h.AriaInvalid(true)] : []),',
        replace: '',
      },
    ],
    tests: unit,
  },
  {
    name: 'the stepper words are ignored',
    edits: [{ file: view, find: 'text.decrease, atMin', replace: "'Decrease', atMin" }],
    tests: unit,
  },
  {
    name: 'the end drawing is dropped',
    edits: [{ file: view, find: '...sides.end,', replace: '' }],
    tests: unit,
  },
  {
    name: 'a read-only field still takes keys',
    edits: [{ file: view, find: ': readOnly', replace: ': false' }],
    tests: unit,
  },
  {
    name: 'the steppers after the number stay at the sides',
    edits: [
      {
        file: '../src/recipes/numberField.ts',
        find: "decrement: variant(Style.self({ order: '3' })),",
        replace: "decrement: variant(Style.self({ order: '0' })),",
      },
    ],
    tests: browser,
  },
  {
    name: 'a field with no steppers draws them',
    edits: [
      {
        file: '../src/recipes/numberField.ts',
        find: "decrement: variant(Style.self({ display: 'none' })),",
        replace: "decrement: variant(Style.self({ display: 'grid' })),",
      },
    ],
    tests: browser,
  },
  {
    name: 'an invalid field keeps its own edge',
    edits: [
      {
        file: '../src/recipes/numberField.ts',
        find: '{ borderColor: ref.error.outline }),',
        replace: '{ borderColor: ref.outline.default }),',
      },
    ],
    tests: browser,
  },
]
