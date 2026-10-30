/**
 * The Picker, broken in turn: `pnpm mutate packages/mixins-ui/test/picker.mutations.ts`.
 * The Model's cases die in the unit tests, the drawing's and the recipe's in
 * the browser's at both widths, a tap's in the touch test.
 */
const file = '../src/picker.ts'
const recipe = '../src/recipes/picker.ts'
const unit = ['packages/mixins-ui/test/picker.test.ts']
const browser = ['packages/mixins-ui/test/picker.browser.test.ts']
const touch = ['packages/mixins-ui/test/picker.touch.browser.test.ts']

export default [
  {
    name: 'opening the Sheet leaves the Listbox open',
    edits: [{ file, find: 'const closed = model.listbox.isOpen', replace: 'const closed = false' }],
    tests: unit,
  },
  {
    name: 'a choice in the Sheet is not reported',
    edits: [{ file, find: '      outMessage: OutMessage.Chose({ value }),\n', replace: '' }],
    tests: unit,
  },
  {
    name: 'a choice in the Sheet leaves it open',
    edits: [
      {
        file,
        find: '...sheetStep(model, Sheet.close(model.sheet)),',
        replace: '...sheetStep(model, { model: model.sheet }),',
      },
    ],
    tests: unit,
  },
  {
    name: 'a choice in the Listbox is not reported',
    edits: [{ file, find: '...(next.outMessage === undefined', replace: '...(true' }],
    tests: unit,
  },
  {
    name: 'a step makes a new Model',
    edits: [
      {
        file,
        find: 'Stepped: ({ to }) => ({ model, commands:',
        replace: 'Stepped: ({ to }) => ({ model: { ...model }, commands:',
      },
    ],
    tests: unit,
  },
  {
    name: 'a Listbox that changed nothing makes a new Model',
    edits: [
      {
        file,
        find: 'model: next.model === model.listbox ? model : modifyFields(',
        replace: 'model: false ? model : modifyFields(',
      },
    ],
    tests: unit,
  },
  {
    name: 'ArrowDown moves up',
    edits: [
      {
        file,
        find: "if (key === 'ArrowDown') return Option.some(Math.min(count - 1, index + 1))",
        replace: "if (key === 'ArrowDown') return Option.some(Math.max(0, index - 1))",
      },
    ],
    tests: browser,
  },
  {
    name: 'Home moves nowhere',
    edits: [{ file, find: "  if (key === 'Home') return Option.some(0)\n", replace: '' }],
    tests: browser,
  },
  {
    name: 'every option is in the tab order',
    edits: [{ file, find: 'h.Tabindex(index === focused ? 0 : -1),', replace: 'h.Tabindex(0),' }],
    tests: browser,
  },
  {
    name: 'the chosen option does not take the first focus',
    edits: [
      {
        file,
        find: '...(index === focused ? dialog.initialFocus : []),',
        replace: '...(index === 0 ? dialog.initialFocus : []),',
      },
    ],
    tests: browser,
  },
  {
    name: 'no option reads as chosen',
    edits: [
      {
        file,
        find: 'h.AriaSelected(Option.contains(value, option.value)),',
        replace: 'h.AriaSelected(false),',
      },
    ],
    tests: browser,
  },
  {
    name: 'a tap on an option chooses nothing',
    edits: [
      {
        file,
        find: 'h.OnClick(onMessage(Message.ChoseInSheet({ value: option.value }))),',
        replace: '',
      },
    ],
    tests: touch,
  },
  {
    name: 'the dropdown shows on a phone',
    edits: [
      {
        file: recipe,
        find: "dropdown: variant(Style.at(below(name), Style.self({ display: 'none' }))),",
        replace: "dropdown: variant(Style.self({ display: 'block' })),",
      },
    ],
    tests: browser,
  },
  {
    name: 'the opener shows on a desktop',
    edits: [{ file: recipe, find: "    Style.self({ display: 'none' }),\n", replace: '' }],
    tests: browser,
  },
  {
    name: 'the breakpoint chosen is ignored',
    edits: [
      {
        file: recipe,
        find: '${Theme.tokens.breakpoint[name]}',
        replace: '${Theme.tokens.breakpoint.md}',
      },
    ],
    tests: browser,
  },
]
