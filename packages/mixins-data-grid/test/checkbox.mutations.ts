/**
 * The checkbox editor, each rule broken in turn: `pnpm mutate
 * packages/mixins-data-grid/test/checkbox.mutations.ts` checks that a test
 * fails for every one.
 *
 * Run note: the two type-level survivors ("a checkbox column may read any
 * value", "a listed member may be a checkbox") are killed by `tsc -b`, which
 * reports their `@ts-expect-error` unused (types.test-d.ts:256,
 * crud.test.ts:95); `pnpm mutate` runs no typecheck, so they were checked by
 * hand on 2026-11-11.
 */
const grid = '../../data-grid/src/grid.ts'
const columns = '../../data-grid/src/columns.ts'
const view = '../src/view.ts'
const press = '../src/press.ts'
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
        file: columns,
        find: 'if (isBooleanLike(type)) return CellEditor.Checkbox()',
        replace: 'if (false) return CellEditor.Checkbox()',
      },
    ],
    tests: unit,
  },
  {
    name: 'a boolean schema is read after the choice',
    edits: [
      {
        file: columns,
        find: '  if (isBooleanLike(type)) return CellEditor.Checkbox()\n',
        replace: '',
      },
      {
        file: columns,
        find: '  if (isDate(type)) return CellEditor.Date()',
        replace:
          '  if (isBooleanLike(type)) return CellEditor.Checkbox()\n  if (isDate(type)) return CellEditor.Date()',
      },
    ],
    tests: unit,
  },
  {
    name: 'Columns.checkbox writes true for either value',
    edits: [
      {
        file: columns,
        find: "encode: SchemaGetter.transform(value => (value ? 'true' : 'false')),",
        replace: "encode: SchemaGetter.transform(() => 'true'),",
      },
    ],
    tests: unit,
  },
  {
    name: 'a checkbox column may read any value',
    edits: [
      {
        file: columns,
        find: '    ? { readonly value: (row: Row) => boolean }\n    : unknown',
        replace: '    ? unknown\n    : unknown',
      },
    ],
    tests: unit,
    survives:
      'a type: tsc -b reports the @ts-expect-error in packages/data-grid/test/types.test-d.ts unused (checked by hand)',
  },
  {
    name: 'a listed member may be a checkbox',
    edits: [
      {
        file: '../../data-grid/src/crud.ts',
        find: "    ? { readonly edit: 'A listed member shows as text, so it cannot be a checkbox' }",
        replace: '    ? unknown',
      },
    ],
    tests: ['packages/data-grid/test/crud.test.ts'],
    survives:
      'a type: tsc -b reports the @ts-expect-error in packages/data-grid/test/crud.test.ts unused (checked by hand)',
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
        find: '                Option.isNone(model.editing) &&\n',
        replace: '                  true &&\n',
      },
    ],
    tests: unit,
  },
  {
    name: 'a key toggles a cell focus has left',
    edits: [
      {
        file: grid,
        find: 'Key: ({ drawn }) => sameFocus(drawn, model.focus.current),',
        replace: 'Key: () => true,',
      },
    ],
    tests: unit,
  },
  {
    name: 'a key needs a focused cell in the Model, not the tab stop it was drawn on',
    edits: [
      {
        file: grid,
        find: 'Key: ({ drawn }) => sameFocus(drawn, model.focus.current),',
        replace:
          'Key: ({ drawn }) => Option.isSome(model.focus.current) && sameFocus(drawn, model.focus.current),',
      },
    ],
    tests: [...unit, ...browser],
  },
  {
    name: 'a toggle leaves focus where it was',
    edits: [
      {
        file: grid,
        find: '              model: clearCells(focusTo(model, address)),\n              outMessage: Out.Edited',
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
    name: 'a checkbox offers options',
    edits: [
      {
        file: grid,
        find: '        Checkbox: () => Option.none(),\n        Choice: ({ options }) => Option.some(options),',
        replace:
          "        Checkbox: () => Option.some(['true', 'false']),\n        Choice: ({ options }) => Option.some(options),",
      },
    ],
    tests: unit,
    survives:
      'nothing asks a checkbox its options: EditTyped refuses the column before reading them, and EditStepped needs an open edit, which a checkbox never holds. The arm keeps the match exhaustive.',
  },
  {
    name: 'the box is drawn unchecked whatever the value',
    edits: [
      {
        file: view,
        find: 'h.AriaChecked(grid.columns.byId[id].value(row) === true),',
        replace: 'h.AriaChecked(false),',
      },
    ],
    tests: unit,
  },
  {
    name: 'the grid points at the cell, not the box',
    edits: [
      {
        file: view,
        find: '            ? checkboxId(grid.id, address)\n',
        replace: '            ? GridFocus.cellId(grid.id, address)\n',
      },
    ],
    tests: [...unit, ...browser],
  },
  {
    name: 'a checkbox cell is marked editable, and takes a double-click edit',
    edits: [
      {
        file: view,
        find: '...(editable(id) && !checkboxes.has(id)',
        replace: '...(editable(id)',
      },
    ],
    tests: unit,
  },
  {
    name: 'Delete lays empty text on a checkbox',
    edits: [
      {
        file: view,
        find: 'const clearable = (column: Id) => editable(column) && !checkboxes.has(column)',
        replace: 'const clearable = editable',
      },
    ],
    tests: unit,
  },
  {
    name: 'Space selects the row on a checkbox',
    edits: [{ file: view, find: '          checkboxKey,\n', replace: '' }],
    tests: [...unit, ...browser],
  },
  {
    name: 'Enter does not toggle',
    edits: [
      {
        file: view,
        find: "(key === ' ' || key === 'Enter') && plainKey(modifiers)",
        replace: "key === ' ' && plainKey(modifiers)",
      },
    ],
    tests: [...unit, ...browser],
  },
  {
    name: 'a key sends the toggle from the drawn value inverted',
    edits: [{ file: view, find: 'checked: value === true,', replace: 'checked: value !== true,' }],
    tests: [...unit, ...browser],
  },
  {
    name: 'a key on a row not loaded toggles it',
    edits: [
      {
        file: view,
        find: 'Option.map(valueAt(address), value =>',
        replace: 'Option.map(Option.some(Option.getOrUndefined(valueAt(address))), value =>',
      },
    ],
    tests: unit,
  },
  {
    name: 'a press with a modifier toggles',
    edits: [
      {
        file: press,
        find: 'const plain = !shiftKey && !toggleKey && modified.altKey !== true',
        replace: 'const plain = true',
      },
    ],
    tests: unit,
  },
  {
    name: 'a press with Alt toggles',
    edits: [{ file: press, find: ' && modified.altKey !== true', replace: '' }],
    tests: unit,
  },
  {
    name: 'a press reads the box as unchecked',
    edits: [
      {
        file: press,
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
        file: press,
        find: 'const box = from.closest(`[${checkboxAttribute}]`)',
        replace: 'const box = null as Element | null',
      },
    ],
    tests: [...unit, ...browser],
  },
  {
    name: 'any role="checkbox" in a cell is the grid’s',
    edits: [
      {
        file: press,
        find: 'const box = from.closest(`[${checkboxAttribute}]`)',
        replace: 'const box = from.closest(\'[role="checkbox"]\')',
      },
    ],
    tests: unit,
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
