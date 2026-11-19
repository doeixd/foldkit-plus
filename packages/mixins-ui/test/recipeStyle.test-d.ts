/**
 * `Recipes.X.style(selection)`'s types: the selection is checked where it is
 * written, and the result is a style of that recipe's contract alone. One
 * defect per refusal.
 */
import type { HtmlBuilder } from 'foldkit/html'
import { Style, type NamedStyle } from 'foldkit-mixins'
import { AppStyle } from 'foldkit-mixins/app'
import { expectTypeOf, test } from 'vitest'
import { Button, Recipes, Table, TableSlots } from '../src/index.js'

interface Row {
  readonly id: string
}
type Message = { readonly _tag: 'Pressed' }
declare const h: HtmlBuilder<Message>
const columns = [{ header: 'Id', value: (row: Row) => row.id }]
const rows: ReadonlyArray<Row> = []

test('the result is the two-call form’s, and a view and configure take it', () => {
  const Striped = Recipes.Table.style({ rows: 'striped' })
  expectTypeOf(Striped).toEqualTypeOf<NamedStyle<typeof TableSlots>>()
  expectTypeOf(Striped).toEqualTypeOf(
    Style.forSlots(TableSlots)(Recipes.Table({ rows: 'striped' })),
  )
  Table.view<Row, Message>({ columns, rows, style: Striped }, h)
  Table.view<Row, Message>({ columns, rows, style: Recipes.Table.style() }, h)
  Table.configure({ base: { style: Striped } })
  Button.configure({ base: { style: Recipes.Button.style({ tone: 'danger' }) } })
})

test('a recipe after add and extend has it, with the axes it gained', () => {
  const Ranked = Recipes.Button.add({ rank: { first: { button: Style.class('first') } } })
  Button.configure({ base: { style: Ranked.style({ rank: 'first', tone: 'danger' }) } })
  const Branded = Recipes.Button.extend({ base: { button: Style.class('brand') } })
  Button.configure({ base: { style: Branded.style({ size: 'sm' }) } })
})

test('an application places it in its own layer', () => {
  const { L } = AppStyle.make({})
  Table.view<Row, Message>(
    { columns, rows, style: Recipes.Table.style({ rows: 'striped' }, { layer: L.layer('app') }) },
    h,
  )
})

test('a value the axis lacks is refused', () => {
  // @ts-expect-error `zebra` is no value of `rows`.
  Recipes.Table.style({ rows: 'zebra' })
})

test('an axis the recipe lacks is refused', () => {
  // @ts-expect-error the table recipe has no `tone`.
  Recipes.Table.style({ tone: 'danger' })
})

test('an axis an add gave is refused on the recipe it was called on', () => {
  Recipes.Button.add({ rank: { first: { button: Style.class('first') } } })
  // @ts-expect-error only the added recipe has `rank`.
  Recipes.Button.style({ rank: 'first' })
})

test('a style of another recipe is refused by a view', () => {
  // @ts-expect-error a Button style on a Table.
  Table.view<Row, Message>({ columns, rows, style: Recipes.Button.style() }, h)
})

test('a style of another recipe is refused by configure', () => {
  // @ts-expect-error a Table style on a Button.
  Button.configure({ base: { style: Recipes.Table.style() } })
})
