/**
 * `UiForm.renderers`, broken in turn: `pnpm mutate packages/mixins-form/test/uiRenderers.mutations.ts`.
 */
const ui = '../src/ui.ts'
const renderers = '../src/renderers.ts'
const index = '../src/index.ts'
const tests = ['packages/mixins-form/test/uiRenderers.test.ts']

const keys = ['packages/mixins-form/test/uiRenderers.browser.test.ts']

export default [
  {
    name: 'the Toggle is no button, so Space presses nothing',
    edits: [{ file: ui, find: 'return h.button(', replace: 'return h.span(' }],
    tests: keys,
  },
  {
    name: 'a choice is no button, so Space presses nothing',
    edits: [{ file: ui, find: '            h.button(\n', replace: '            h.span(\n' }],
    tests: keys,
  },
  {
    name: 'the select sends no change',
    edits: [
      {
        file: renderers,
        find: 'h.select(slots.select.attrs([...state, h.OnChange(change), h.OnBlur(blurred)])',
        replace: 'h.select(slots.select.attrs([...state, h.OnBlur(blurred)])',
      },
    ],
    tests: keys,
  },
  {
    name: 'the UI field says its checking line in its own words',
    edits: [
      {
        file: ui,
        find: "options.words?.checking ?? 'Checking…'",
        replace: "'Checking…'",
      },
    ],
    tests: ['packages/mixins-form/test/ui.test.ts'],
  },
  {
    name: 'a text input keeps the plain Slot, so the UI recipe never reaches it',
    edits: [{ file: ui, find: 'text: textInput(context)', replace: 'text: context.slots.text' }],
    tests,
  },
  {
    name: 'the toggle button carries the key as its name',
    edits: [
      {
        file: ui,
        find: "...state.filter(attribute => attribute._tag !== 'Name'),",
        replace: '...state,',
      },
    ],
    tests,
  },
  {
    name: 'a checked toggle posts nothing',
    edits: [
      {
        file: ui,
        find: "on && input.locked !== true ? [hidden(h, input.control.key, 'on')] : []",
        replace: '[]',
      },
    ],
    tests,
  },
  {
    name: 'a locked checked toggle posts twice',
    edits: [{ file: ui, find: 'on && input.locked !== true ?', replace: 'on ?' }],
    tests,
  },
  {
    name: 'the toggle reads unchecked whatever its draft',
    edits: [
      {
        file: ui,
        find: 'h.AriaChecked(on),\n          h.OnClick',
        replace: 'h.AriaChecked(false),\n          h.OnClick',
      },
    ],
    tests,
  },
  {
    name: 'a press on the toggle sends what it holds',
    edits: [{ file: ui, find: 'h.OnClick(change(!on))', replace: 'h.OnClick(change(on))' }],
    tests,
  },
  {
    name: 'a chosen choice posts nothing',
    edits: [
      {
        file: ui,
        find: 'on && !locked ? [hidden(h, input.control.key, option.value)] : []',
        replace: '[]',
      },
    ],
    tests,
  },
  {
    name: 'a choice’s label is for no checkbox',
    edits: [
      {
        file: ui,
        find: 'group.label.attrs([h.For(id)])',
        replace: 'group.label.attrs([h.For(option.value)])',
      },
    ],
    tests,
  },
  {
    name: 'a group takes every state attribute',
    edits: [
      {
        file: renderers,
        find: 'state.filter(attribute => GROUP_STATE.has(attribute._tag))',
        replace: 'state',
      },
    ],
    tests,
  },
  {
    name: 'a group takes none of the field’s state',
    edits: [
      {
        file: renderers,
        find: 'state.filter(attribute => GROUP_STATE.has(attribute._tag))',
        replace: '[]',
      },
    ],
    tests,
  },
  {
    name: 'a locked checked box posts nothing',
    edits: [
      {
        file: index,
        find: "  if (typeof draft === 'boolean') return draft ? ['on'] : []\n",
        replace: '',
      },
    ],
    tests,
  },
]
