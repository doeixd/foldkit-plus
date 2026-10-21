/**
 * The checkbox group, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/checkboxGroup.mutations.ts`.
 */
const unit = ['packages/mixins-ui/test/checkboxGroup.test.ts']
const browser = ['packages/mixins-ui/test/checkboxGroup.browser.test.ts']
const view = '../src/checkboxGroup.ts'
const recipe = '../src/recipes/checkboxGroup.ts'

export default [
  {
    name: 'a label names nothing',
    edits: [
      {
        file: view,
        find: 'builders.label.attrs([h.For(checkboxId)])',
        replace: 'builders.label.attrs([])',
      },
    ],
    tests: [...unit, ...browser],
  },
  {
    name: 'a toggle keeps the option checked',
    edits: [
      {
        file: '../src/choices.ts',
        find: 'values.includes(value) ? values.filter(each => each !== value) : [...values, value]',
        replace: 'values.includes(value) ? values : [...values, value]',
      },
    ],
    tests: unit,
  },
  {
    name: 'a checked row in a list does not fill',
    edits: [
      {
        file: recipe,
        find: 'Style.pseudo(checked, { background: ref.accent.subtle }),',
        replace: '',
      },
    ],
    tests: browser,
  },
  {
    name: 'a vertical list leaves a gap between checked rows',
    edits: [{ file: recipe, find: "gap: '0'", replace: "gap: ladder('gap')" }],
    tests: browser,
  },
  {
    name: 'a horizontal group stacks its options',
    edits: [{ file: recipe, find: "flexDirection: 'row'", replace: "flexDirection: 'column'" }],
    tests: browser,
  },
  {
    name: 'a disabled option counts as a choice',
    edits: [
      {
        file: view,
        find: 'option.disabled === true ? [] : [option.value]',
        replace: '[option.value]',
      },
    ],
    tests: unit,
  },
  {
    name: 'every mix of checks is some',
    edits: [
      {
        file: view,
        find: "return on === values.length ? 'all' : 'some'",
        replace: "return 'some'",
      },
    ],
    tests: unit,
  },
  {
    name: 'an error is not announced',
    edits: [
      {
        file: view,
        find: 'invalid ? [h.AriaInvalid(true), h.AriaDescribedBy(errorId)] : []',
        replace: '[]',
      },
    ],
    tests: unit,
  },
  {
    name: 'checked rows together keep their corners',
    edits: [
      {
        file: recipe,
        find: 'Style.nest(`${checked} + &${checked}`, {',
        replace: 'Style.nest(`[data-never] + &${checked}`, {',
      },
    ],
    tests: browser,
  },
  {
    name: 'select-all drops a disabled option that is checked',
    edits: [
      {
        file: view,
        find: '(option.disabled === true ? held.has(option.value) : on)',
        replace: '(option.disabled === true ? false : on)',
      },
    ],
    tests: [...unit, ...browser],
  },
  {
    name: 'select-all only ever checks',
    edits: [
      {
        file: view,
        find: "setEnabled(options.options, options.checked, state !== 'all')",
        replace: 'setEnabled(options.options, options.checked, true)',
      },
    ],
    tests: browser,
  },
  {
    name: 'select-all is never mixed',
    edits: [{ file: view, find: "some: 'mixed',", replace: 'some: false,' }],
    tests: unit,
  },
  {
    name: 'the legend touches the first row',
    edits: [{ file: recipe, find: "marginBlockEnd: ladder('gap'),", replace: '' }],
    tests: browser,
  },
  {
    name: 'a row is a rung tall, however short its words',
    edits: [
      {
        file: recipe,
        find: "rowGap: ladder('inset'),",
        replace: "rowGap: ladder('inset'), minBlockSize: ladder('height'),",
      },
    ],
    tests: browser,
  },
  {
    name: 'the options stand flush under the select-all box',
    edits: [
      {
        file: recipe,
        find: "marginInlineStart: `calc(${ladder('icon')} + ${ladder('gap')})`,",
        replace: '',
      },
    ],
    tests: browser,
  },
  {
    name: "a disabled option's words stay bright",
    edits: [
      {
        file: recipe,
        find: "component(Style.nest(dimmed, { opacity: ref.knob['state-disabled'] })),",
        replace: 'Style.empty,',
      },
    ],
    tests: browser,
  },
]
