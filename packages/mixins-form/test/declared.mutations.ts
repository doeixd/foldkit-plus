/**
 * The date and amount renderers, and a form drawn from `Declared.of(form)`,
 * broken in turn: `pnpm mutate packages/mixins-form/test/declared.mutations.ts`.
 */
const index = '../src/index.ts'
const renderers = '../src/renderers.ts'
const ui = '../src/ui.ts'
const unit = 'packages/mixins-form/test/declared.test.ts'
const browser = 'packages/mixins-form/test/declared.browser.test.ts'
const declared = '...(options.declared === undefined ? {} : { declared: options.declared }),'

export default [
  {
    name: 'the day is a text input, so no date picker opens',
    edits: [
      {
        file: renderers,
        find: "context.h.Type('date'), ...limits(context)",
        replace: "context.h.Type('text'), ...limits(context)",
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'the date input takes no bounds',
    edits: [
      {
        file: renderers,
        find: "context.h.Type('date'), ...limits(context)",
        replace: "context.h.Type('date')",
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'the amount input takes no bounds',
    edits: [
      {
        file: renderers,
        find: '          ...limits(context),\n',
        replace: '',
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'the amount shows the plain keypad whatever the declaration says',
    edits: [
      {
        file: renderers,
        find: "          context.h.InputMode(context.attrs.inputMode ?? 'decimal'),\n          ...limits(context),",
        replace: "          context.h.InputMode('text'),\n          ...limits(context),",
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'the amount ignores the input type the caller asks for',
    edits: [
      {
        file: renderers,
        find: "          context.h.Type(context.attrs.type ?? 'text'),\n          context.h.InputMode(context.attrs.inputMode ?? 'decimal'),",
        replace:
          "          context.h.Type('text'),\n          context.h.InputMode(context.attrs.inputMode ?? 'decimal'),",
      },
    ],
    tests: [browser],
  },
  {
    name: 'no step is put on an input',
    edits: [
      {
        file: renderers,
        find: '    ...(attrs.step === undefined ? [] : [h.Step(attrs.step)]),\n',
        replace: '',
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'no maximum is put on an input',
    edits: [
      {
        file: renderers,
        find: '    ...(attrs.max === undefined ? [] : [h.Max(attrs.max)]),\n',
        replace: '',
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'no minimum is put on an input',
    edits: [
      {
        file: renderers,
        find: '    ...(attrs.min === undefined ? [] : [h.Min(attrs.min)]),\n',
        replace: '',
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'the declared constraints are not read for a key’s attributes',
    edits: [
      {
        file: index,
        find: 'declared !== undefined && Object.hasOwn(declared.constraints, key)',
        replace: 'false',
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'the attrs a caller gives lose to the declared ones',
    edits: [
      {
        file: index,
        find: '      ...given?.[key],\n',
        replace: '',
      },
    ],
    tests: [unit],
  },
  {
    name: 'the whole-form view reads the form’s own field, not the declared one',
    edits: [
      {
        file: index,
        find: 'field: key => read(input.model, key as Key),',
        replace: 'field: key => form.field(input.model, key as Key),',
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'a single key drawn in a layout reads the form’s own field',
    edits: [
      {
        file: index,
        find: 'const state = read(model, control.key)',
        replace: 'const state = form.field(model, control.key)',
      },
    ],
    tests: [unit],
  },
  {
    name: 'the declared form is ignored whatever it is given',
    edits: [
      {
        file: index,
        find: 'declared === undefined ? (model, key) => form.field(model, key) : declared.field',
        replace: '(model, key) => form.field(model, key)',
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'define does not hand the declared form to the field view it makes',
    edits: [
      {
        file: index,
        find: `        ${declared}\n      })\n    const read = fieldOf(form, options.declared)`,
        replace: '      })\n    const read = fieldOf(form, options.declared)',
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'fields does not hand the declared form to its base field view',
    edits: [
      {
        file: index,
        find: `        ${declared}\n      })\n    const attrsFor = attrsOf(options.attrs, options.declared)`,
        replace: '      })\n    const attrsFor = attrsOf(options.attrs, options.declared)',
      },
    ],
    tests: [unit],
  },
  {
    name: 'fields does not hand the declared form to the whole-form view',
    edits: [
      {
        file: index,
        find: `        ${declared}\n      }),\n      field: (<M>(`,
        replace: '      }),\n      field: (<M>(',
      },
    ],
    tests: [unit],
  },
  {
    name: 'UiForm draws the date through the plain slot, not the Input component’s',
    edits: [
      {
        file: ui,
        find: 'slots: { ...context.slots, date: textInput(context) }',
        replace: 'slots: { ...context.slots }',
      },
    ],
    tests: [unit],
  },
  {
    name: 'UiForm draws the amount through the plain slot, not the Input component’s',
    edits: [
      {
        file: ui,
        find: 'slots: { ...context.slots, decimal: textInput(context) }',
        replace: 'slots: { ...context.slots }',
      },
    ],
    tests: [unit],
  },
]
