/**
 * The page, in the demos' frame: where the edits stand in the header, a strip
 * of what is read and drawn, the panel that says who owns what, and the grid
 * over the list's page. The rows, their status and the order are read from
 * Remote and the Model on every render; the grid draws only what is in view.
 */
import { Option } from 'effect'
import type { Document, Html, HtmlBuilder } from 'foldkit/html'
import type { ModuleManifest } from 'foldkit-surface'
import { RowCount } from 'foldkit-data-grid'
import { GridCrud } from 'foldkit-data-grid/crud'
import { SlotView, Style } from 'foldkit-mixins'
import {
  DataGridView,
  GridLegend,
  GridLegendStyle,
  GridMarkStyle,
  GridStyle,
  MoreOnScroll,
} from 'foldkit-mixins-data-grid'
import { Alert, AppShell, Input } from 'foldkit-mixins-ui'
import { Grid, Message, Products, exchangeOf, geometryOf, marksOf, type Model } from './app.js'
import type { EditedColumn } from './domain.js'
import { ProductSort } from './operations.js'
import { ownershipPanel } from './ownership.js'
import { GridFrame, Page, RefusedStyle, ReplacedStyle, SearchStyle, ShellStyle } from './style.js'

const Registry = DataGridView<Message>().define(Grid).pipe(
  Style.attach(GridStyle),
  // The shared marks, after GridStyle, whose plain dot they replace by name.
  Style.attach(GridMarkStyle),
  Style.attach(GridFrame),
  // The next page is read as the end comes into view.
  MoreOnScroll,
)

/** What each mark on a cell means, each beside a swatch drawn by the cells' own rules. */
const Legend = GridLegend<Message>().pipe(Style.attach(GridLegendStyle))

const columnName = (column: EditedColumn) => Grid.columns.byId[column].header

/** The refused edits, one per operation, naming the cells each had changed. */
const refusedEdits = (model: Model) => {
  const byOperation = new Map<string, { cells: Array<string>; reason: string }>()
  for (const refusal of model.refused) {
    const entry = byOperation.get(refusal.opId) ?? { cells: [], reason: refusal.reason }
    entry.cells.push(`${columnName(refusal.column)} of ${refusal.id}`)
    byOperation.set(refusal.opId, entry)
  }
  return [...byOperation].map(([opId, { cells, reason }]) => ({
    opId,
    cells: cells.join(', '),
    reason,
  }))
}

/** One notice above the grid, in a list of its kind, with its dismiss button. */
const notice = (
  h: HtmlBuilder<Message>,
  key: string,
  style: typeof RefusedStyle,
  title: string,
  onDismiss: Message,
): Html => h.li([h.Key(key)], [Alert.view({ layout: 'inline', title, onDismiss, style }, h)])

/** The page, with the panel listing `manifest`'s owners. */
export const view = (model: Model, h: HtmlBuilder<Message>, manifest: ModuleManifest): Document => {
  const slots = SlotView.buildersFor(Page.slots, [Page.style.mixin], { input: undefined, h })
  const page = Products.page(model)
  // What the grid is drawn from, given to the grid and to the count of what it draws.
  const geometry = geometryOf(model)
  const { rows } = geometry
  const shown = Grid.window(geometry)
  // Kept on the device, by choice or because the server cannot be reached.
  const waiting = model.offline || Option.isSome(model.exchange.error)
  const content = h.div(slots.content.attrs(), [
    // What is shown, and the controls over it.
    h.div(slots.toolbar.attrs(), [
      h.p(slots.counts.attrs([h.Id('counts')]), [
        // Read, not counted: the server has more until a page says it has none.
        // Drawn is the grid's own window, not an estimate.
        [
          RowCount.match(rows.count, {
            Known: ({ total }) => `${total.toLocaleString()} products`,
            Unknown: ({ atLeast }) => `${atLeast.toLocaleString()} read, more to come`,
          }),
          `${(shown.rows.end - shown.rows.start).toLocaleString()} rows drawn`,
        ].join(' · '),
      ]),
      h.div(slots.controls.attrs(), [
        // The query's input: the server filters, over every product, not the page read.
        Input.view(
          {
            id: 'search',
            type: 'search',
            value: model.search,
            placeholder: 'Search descriptions',
            onInput: text => Message.SearchChanged({ text }),
            style: SearchStyle,
            // The page's slot on an element of its own: one element keeps one Slot's class.
            draw: (resolved, h) =>
              h.div(slots.search.attrs(), [
                h.input([...resolved.input, h.AriaLabel('Search descriptions')]),
              ]),
          },
          h,
        ),
        h.label(slots.offline.attrs(), [
          h.input(
            slots.box.attrs([
              h.Type('checkbox'),
              h.Checked(model.offline),
              h.OnChange(() => Message.OfflineToggled()),
            ]),
          ),
          'Work offline',
        ]),
      ]),
    ]),
    Legend({}, h),
    ownershipPanel(manifest, model, shown, slots, h),
    // What the server refused, said once per edit with its reason; the cells
    // it had changed show the server's value again, edged in red.
    h.ul(
      slots.notices.attrs([h.Id('refused'), h.AriaLabel('Edits not saved')]),
      refusedEdits(model).map(({ opId, cells, reason }) =>
        notice(
          h,
          opId,
          RefusedStyle,
          `${cells} not saved: ${reason}.`,
          Message.RefusalDismissed({ opId }),
        ),
      ),
    ),
    // What another device's later commit replaced: last writer wins, said here.
    h.ul(
      slots.notices.attrs([h.Id('replaced'), h.AriaLabel('Edits replaced')]),
      model.replaced.map(({ id, column, by, was }) =>
        notice(
          h,
          `${id}:${column}`,
          ReplacedStyle,
          `${columnName(column)} of ${id}: ${Option.match(by, {
            onSome: name => `${name}’s later edit`,
            onNone: () => 'a later edit',
          })} replaced yours (${was}).`,
          Message.ReplacementDismissed({ id, column }),
        ),
      ),
    ),
    // What an undo or a redo left alone: a cell changed since is not overwritten.
    h.ul(
      slots.notices.attrs([h.Id('held-back'), h.AriaLabel('Cells left alone')]),
      Option.match(model.heldBack, {
        onNone: () => [],
        onSome: ({ by, cells }) => [
          notice(
            h,
            'held-back',
            ReplacedStyle,
            `${cells.map(({ id, column }) => `${columnName(column)} of ${id}`).join(', ')} changed since; not ${by === 'undo' ? 'undone' : 'redone'}.`,
            Message.HeldBackDismissed(),
          ),
        ],
      }),
    ),
    Registry(
      {
        ...geometry,
        wrap: message => Message.GotGridMessage({ message }),
        label: 'Products',
        status: GridCrud.status(page),
        onRetry: Message.RetriedProducts(),
        onMore: Message.RequestedMoreProducts(),
        // The orders the query offers; a header asks for one, and the Model reads it.
        // The column clicked, not the order it leads to: two clicks in one frame
        // toggle twice, from the Model as it is, not the order last drawn.
        sort: ProductSort.inputs(model.sort, (_, column) => Message.SortedProducts({ column })),
        columnMenu: true,
        marks: marksOf(model),
      },
      h,
    ),
  ])
  const body = AppShell.view(
    {
      title: 'Products',
      style: ShellStyle,
      // Always in the page, so a change is announced; a pill only when it says something.
      status: [
        h.p(
          slots.exchange.attrs([
            h.Id('exchange'),
            h.Role('status'),
            h.DataAttribute('waiting', String(waiting)),
          ]),
          [exchangeOf(model)],
        ),
      ],
    },
    [content],
    h,
  )
  return { title: 'Product registry', body }
}
