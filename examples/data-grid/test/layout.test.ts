/**
 * The column layout kept in this browser: read back as the page opens,
 * leniently, and saved whenever a transition changes the columns, and only
 * then.
 */
import { Option } from 'effect'
import { expect, test } from 'vitest'
import { Grid, Message, init, update } from '../src/main.js'

const resize = (width: number) =>
  Message.GotGridMessage({ message: Grid.Message.ColumnResized({ column: 'price', width }) })
/** The layouts a transition's Commands save, as the text written. */
const saved = (
  commands: ReadonlyArray<{ readonly name: string; readonly args?: Record<string, unknown> }> = [],
) =>
  commands
    .filter(command => command.name === 'SaveLayout')
    .map(command => String(command.args?.['layout']))

test('a change to the columns is saved, and the save opens the page as it was left', () => {
  const opened = init(10).model
  const resized = update(opened, resize(150))
  const [layout] = saved(resized.commands)
  expect(layout).toBe(JSON.stringify(resized.model.grid.columns))

  // Read back as the page opens: the width as it was left.
  const reopened = init(10, Option.some(JSON.parse(layout!))).model
  expect(Grid.columnState.widthOf(reopened.grid.columns)('price')).toBe(150)

  // A transition that leaves the columns as they are saves nothing.
  const focused = update(
    resized.model,
    Message.GotGridMessage({
      message: Grid.Message.Focused({
        address: { row: resized.model.products[0]!.id, column: 'price' },
      }),
    }),
  )
  expect(saved(focused.commands)).toEqual([])
})

test('a saved layout naming a column no longer here keeps the rest', () => {
  const opened = init(
    10,
    Option.some({
      start: ['upc'],
      center: ['gone', 'price'],
      end: [],
      hidden: ['line'],
      widths: [],
    }),
  )
  expect(opened.model.grid.columns.hidden).toEqual(['line'])
  // Something that is no layout at all opens the page as declared.
  expect(init(10, Option.some('nonsense')).model.grid.columns).toEqual(init(10).model.grid.columns)
})
