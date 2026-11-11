/**
 * The checkbox editor, each rule broken in turn: `pnpm mutate
 * packages/mixins-data-grid/test/checkbox.mutations.ts` checks that a test
 * fails for every one.
 */
const grid = '../../data-grid/src/grid.ts'
const unit = [
  'packages/data-grid/test/grid.test.ts',
  'packages/data-grid/test/projection.test.ts',
  'packages/mixins-data-grid/test/checkbox.test.ts',
]
const browser = ['packages/mixins-data-grid/test/checkbox.browser.test.ts']

export default [
  {
    name: 'a boolean schema is no checkbox',
    edits: [
      {
        file: '../../data-grid/src/columns.ts',
        find: 'if (SchemaAST.isBoolean(type)) return CellEditor.Checkbox()',
        replace: 'if (false) return CellEditor.Checkbox()',
      },
    ],
    tests: unit,
  },
  {
    name: 'Columns.checkbox writes true for either value',
    edits: [
      {
        file: '../../data-grid/src/columns.ts',
        find: "encode: SchemaGetter.transform(value => (value ? 'true' : 'false')),",
        replace: "encode: SchemaGetter.transform(() => 'true'),",
      },
    ],
    tests: unit,
  },
  {
    name: 'a toggle commits the value it was drawn with',
    edits: [{ file: grid, find: 'toggle(!checked)', replace: 'toggle(checked)' }],
    tests: unit,
  },
  {
    name: 'a toggle lands while an edit is open',
    edits: [
      {
        file: grid,
        find: '                  Option.isNone(model.editing) &&\n',
        replace: '                  true &&\n',
      },
    ],
    tests: unit,
  },
  {
    name: 'a key toggles a cell focus has left',
    edits: [{ file: grid, find: "(by === 'press' ||", replace: '(true ||' }],
    tests: unit,
  },
  {
    name: 'a toggle leaves focus where it was',
    edits: [
      {
        file: grid,
        find: '                model: clearCells(focusTo(model, address)),\n                outMessage: Out.Edited',
        replace:
          '                model: clearCells(model),\n                outMessage: Out.Edited',
      },
    ],
    tests: unit,
  },
  {
    name: 'a checkbox opens a draft',
    edits: [
      {
        file: grid,
        find: 'edit !== undefined && !toggles.has(column)',
        replace: 'edit !== undefined',
      },
    ],
    tests: unit,
  },
  {
    name: 'the box is drawn unchecked whatever the value',
    edits: [
      {
        file: '../src/view.ts',
        find: 'h.AriaChecked(grid.columns.byId[id].value(row) === true),',
        replace: 'h.AriaChecked(false),',
      },
    ],
    tests: unit,
  },
  {
    name: 'Space selects the row on a checkbox',
    edits: [{ file: '../src/view.ts', find: '          checkboxKey,\n', replace: '' }],
    tests: [...unit, ...browser],
  },
  {
    name: 'Enter does not toggle',
    edits: [
      {
        file: '../src/view.ts',
        find: "(key === ' ' || key === 'Enter') && plainKey(modifiers)",
        replace: "key === ' ' && plainKey(modifiers)",
      },
    ],
    tests: [...unit, ...browser],
  },
  {
    name: 'a key sends the toggle from the drawn value inverted',
    edits: [
      {
        file: '../src/view.ts',
        find: 'checked: value === true,',
        replace: 'checked: value !== true,',
      },
    ],
    tests: [...unit, ...browser],
  },
  {
    name: 'a press with a modifier toggles',
    edits: [
      {
        file: '../src/press.ts',
        find: 'cell.contains(box) && !shiftKey && !toggleKey',
        replace: 'cell.contains(box)',
      },
    ],
    tests: unit,
  },
  {
    name: 'a press reads the box as unchecked',
    edits: [
      {
        file: '../src/press.ts',
        find: "checked: box.getAttribute('aria-checked') === 'true',",
        replace: 'checked: false,',
      },
    ],
    tests: [...unit, ...browser],
  },
  {
    name: 'a press on the box is only the cell’s',
    edits: [
      {
        file: '../src/press.ts',
        find: 'const box = from.closest(\'[role="checkbox"]\')',
        replace: 'const box = null as Element | null',
      },
    ],
    tests: [...unit, ...browser],
  },
  {
    name: 'a checked box is not filled',
    edits: [
      {
        file: '../src/style.ts',
        find: '      Style.nest(\'&[aria-checked="true"]\', {\n        background: ref.accent.default,',
        replace:
          '      Style.nest(\'&[aria-checked="true"]\', {\n        background: ref.surface.base,',
      },
    ],
    tests: browser,
  },
  {
    name: 'a checked box draws no tick',
    edits: [
      {
        file: '../src/style.ts',
        find: "        content: '\"\"',\n        height: '55%',",
        replace: "        height: '55%',",
      },
    ],
    tests: browser,
  },
]
