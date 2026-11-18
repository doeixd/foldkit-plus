/**
 * The options-level views of Checkbox, Switch, Select and RadioGroup, broken
 * in turn: `pnpm mutate packages/mixins-ui/test/choiceViews.mutations.ts`
 * checks that a test fails for every one.
 */
const browser = 'packages/mixins-ui/test/choiceViews.browser.test.ts'

export default [
  {
    name: 'a card’s label is not stretched over it',
    edits: [
      {
        file: '../src/recipes/toggle.ts',
        find: "inset: '0',",
        replace: "inset: 'auto',",
      },
    ],
    tests: [browser],
  },
  {
    name: 'position end does not reverse the row',
    edits: [
      {
        file: '../src/recipes/toggle.ts',
        find: "{ end: { flexDirection: 'row-reverse' } }",
        replace: "{ end: { flexDirection: 'row' } }",
      },
    ],
    tests: [browser],
  },
  {
    name: 'an invalid checkbox is not aria-invalid',
    edits: [
      {
        file: '../src/checkbox/view.ts',
        find: 'invalid ? [...resolved.checkbox, h.AriaInvalid(true)] : resolved.checkbox',
        replace: 'resolved.checkbox',
      },
    ],
    tests: [browser],
  },
  {
    name: 'the checkbox’s form name is dropped',
    edits: [
      {
        file: '../src/checkbox/view.ts',
        find: '...(options.name === undefined ? {} : { name: options.name }),',
        replace: '',
      },
    ],
    tests: [browser],
  },
  {
    name: 'the switch’s danger tone draws the accent',
    edits: [
      {
        file: '../src/recipes/toggle.ts',
        find: 'danger: { button: tones.danger },',
        replace: 'danger: { button: tones.accent },',
      },
    ],
    tests: [browser],
  },
  {
    name: 'a switch with a description is not described by it',
    edits: [
      {
        file: '../src/switch/view.ts',
        find: 'hasDescription: description !== undefined,',
        replace: 'hasDescription: false,',
      },
    ],
    tests: [browser],
  },
  {
    name: 'every option is its own group',
    edits: [
      {
        file: '../src/select/view.ts',
        find: '(a, b) => a.group === b.group',
        replace: '() => false',
      },
    ],
    tests: [browser],
  },
  {
    name: 'a select’s placeholder can be chosen',
    edits: [
      {
        file: '../src/select/view.ts',
        find: "h.Selected(value === undefined || value === '')",
        replace: "h.Disabled(false), h.Selected(value === undefined || value === '')",
      },
    ],
    tests: [browser],
  },
  {
    name: 'a disabled radio can be chosen',
    edits: [
      {
        file: '../src/radioGroup/view.ts',
        find: 'isOptionDisabled: value => rows.get(value)?.disabled === true,',
        replace: 'isOptionDisabled: () => false,',
      },
    ],
    tests: [browser],
  },
  {
    name: 'a radio group’s error does not describe it',
    edits: [
      {
        file: '../src/radioGroup/view.ts',
        find: '...(said ? [h.AriaDescribedBy(errorId(model))] : []),',
        replace: '',
      },
    ],
    tests: [browser],
  },
  {
    name: 'layout grid stays a column',
    edits: [
      {
        file: '../src/recipes/radio.ts',
        find: "'repeat(auto-fit, minmax(min(100%, 12rem), 1fr))'",
        replace: "'1fr'",
      },
    ],
    tests: [browser],
  },
  {
    name: 'a card’s aside sits under the stretched label',
    edits: [
      {
        file: '../src/recipes/toggle.ts',
        find: "aside: variant(Style.self({ position: 'relative' })),",
        replace: 'aside: variant(Style.self({})),',
      },
    ],
    tests: [browser],
  },
]
