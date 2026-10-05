/**
 * The shared marks in a real browser, where the cascade is real: attached
 * after `GridStyle`, a mark's rule replaces its plain dot, and each mark
 * draws differently from the others.
 */
import { Option, Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { Bundle } from 'foldkit-bundle'
import { Columns, DataGrid, GridFocus, RowModel } from 'foldkit-data-grid'
import { Style } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { DataGridView, GridMarkStyle, GridStyle, type GridMark } from 'foldkit-mixins-data-grid'
import { afterEach, expect, test, vi } from 'vitest'

interface Line {
  readonly id: string
}
const marked: ReadonlyArray<GridMark> = ['pending', 'saved', 'refused', 'replaced', 'peer']
const rows = RowModel.fromArray<Line>(
  marked.map((_, index) => ({ id: `r${index}` })),
  line => line.id,
)
const columns = Columns.define<Line>()({ a: { header: 'A', value: () => 'a', width: 100 } })
const Grid = DataGrid.make({ id: 'marks', columns })
const Placement = Bundle.declare(Grid.bundle, 'grid')
const Model = Schema.Struct({ ...Placement.fields })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Placement.cases })
type Message = typeof Message.Type
const application = Bundle.assemble<Model, Message>()([
  Bundle.parent({ Model, Message }).at(Placement, { onOut: Bundle.ignore }),
])
const View = DataGridView<Message>()
  .define(Grid)
  .pipe(Style.attach(GridStyle), Style.attach(GridMarkStyle))
const view = (model: Model, h: HtmlBuilder<Message>) =>
  View(
    {
      state: model.grid,
      rows,
      wrap: message => Placement.wrapper.make(message),
      label: 'Marks',
      rowHeight: 24,
      headerHeight: 24,
      marks: ({ row }) =>
        Option.map(Option.fromUndefinedOr(marked[Number(row.slice(1))]), name => ({
          name,
          description: name,
        })),
    },
    h,
  )

afterEach(() => {
  document.body.replaceChildren()
  document.head.querySelector('#marks-css')?.remove()
})

test('each mark draws as itself, over the grid’s plain dot', async () => {
  const css = document.createElement('style')
  css.id = 'marks-css'
  // As an application writes its sheet: the theme, then the grid, then the marks.
  css.textContent = Style.stylesheet(
    Theme.root(Theme.compose(Theme.tokens, Theme.oklch({ accent: { h: 250, c: 0.1, l: '50%' } }))),
    GridStyle,
    GridMarkStyle,
  )
  document.head.appendChild(css)
  const container = document.createElement('div')
  container.id = 'grid-marks-browser'
  document.body.appendChild(container)
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => application.initial({ grid: Grid.bundle.init(undefined).model }),
      update: application.update(),
      view,
    }),
  )
  const cell = (index: number) =>
    document.getElementById(GridFocus.cellId('marks', { row: `r${index}`, column: 'a' }))
  try {
    await vi.waitFor(() => expect(cell(marked.length - 1)).not.toBeNull())
    const drawn = marked.map((_, index) => {
      const style = getComputedStyle(cell(index)!)
      return { image: style.backgroundImage, shadow: style.boxShadow }
    })
    const [pending, saved, refused, replaced, peer] = drawn
    // The dots: both gradients, not the same one (the grid's plain dot is the focus colour).
    expect(pending!.image).toContain('radial-gradient')
    expect(saved!.image).toContain('radial-gradient')
    expect(saved!.image).not.toBe(pending!.image)
    // The edges replace the grid's dot, and differ from one another.
    for (const edged of [refused, replaced, peer]) {
      expect(edged!.image).toBe('none')
      expect(edged!.shadow).toContain('inset')
    }
    expect(new Set([refused!.shadow, replaced!.shadow, peer!.shadow]).size).toBe(3)
  } finally {
    handle.dispose()
  }
})
