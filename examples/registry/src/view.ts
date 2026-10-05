/**
 * The page: a status line and the grid over the list's page. The rows, their
 * status and the order are read from Remote and the Model on every render;
 * the grid draws only what is in view.
 */
import { Option } from 'effect'
import type { Document, HtmlBuilder } from 'foldkit/html'
import { RowCount } from 'foldkit-data-grid'
import { GridCrud } from 'foldkit-data-grid/crud'
import { Style } from 'foldkit-mixins'
import { DataGridView, GridSlots, GridStyle } from 'foldkit-mixins-data-grid'
import { Grid, Message, Products, exchangeOf, marksOf, rowsOf, type Model } from './app.js'
import { ProductSort } from './operations.js'

const Registry = DataGridView<Message>()
  .define(Grid)
  .pipe(
    Style.attach(GridStyle),
    Style.attach(
      Style.forSlots(GridSlots)({
        root: Style.inline({
          height: 'calc(100vh - 9rem)',
          minHeight: '20rem',
          border: '1px solid #e4e4e7',
          borderRadius: '10px',
          boxShadow: '0 1px 2px rgb(0 0 0 / 0.04)',
        }),
        // An edit's state on its cell: not yet sent is the grid's own dot; one
        // the journal has and the table does not yet, a hollow dot; one the
        // server refused, a red edge until its line is dismissed.
        cell: Style.compose(
          Style.nest('&[data-mark="saved"]', {
            backgroundImage:
              'radial-gradient(circle at calc(100% - 6px) 6px, transparent 2px, #71717a 2.5px, #71717a 3.5px, transparent 4px)',
          }),
          Style.nest('&[data-mark="refused"]', {
            backgroundImage: 'none',
            boxShadow: 'inset 0 0 0 2px #dc2626',
          }),
          // Another device's later edit won: an amber edge until its line is dismissed.
          Style.nest('&[data-mark="replaced"]', {
            backgroundImage: 'none',
            boxShadow: 'inset 0 0 0 2px #d97706',
          }),
        ),
      }),
    ),
  )

const columnName = (column: 'description' | 'cents') =>
  column === 'cents' ? 'Price' : 'Description'

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

const ink = '#18181b'
const muted = '#71717a'

/** A notice above the grid: what the server refused, or what another device replaced. */
const notice = (tone: { readonly border: string; readonly background: string }) =>
  ({
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.5rem 0.75rem',
    border: `1px solid ${tone.border}`,
    borderRadius: '8px',
    background: tone.background,
    fontSize: '0.875rem',
  }) as const
const refusedTone = { border: '#fecaca', background: '#fef2f2' }
const replacedTone = { border: '#fde68a', background: '#fffbeb' }
/** A list of notices, not drawn at all while it has none, so it adds no gap. */
const list = (count: number) =>
  ({
    listStyle: 'none',
    margin: '0',
    padding: '0',
    display: count === 0 ? 'none' : 'grid',
    gap: '0.5rem',
  }) as const

export const view = (model: Model, h: HtmlBuilder<Message>): Document => {
  const page = Products.page(model)
  const rows = rowsOf(model)
  const status = exchangeOf(model)
  // Kept on the device, by choice or because the server cannot be reached.
  const waiting = model.offline || Option.isSome(model.exchange.error)
  const dismiss = (message: Message) =>
    h.button(
      [
        h.Type('button'),
        h.OnClick(message),
        h.Style({
          marginInlineStart: 'auto',
          border: 'none',
          background: 'none',
          color: ink,
          font: 'inherit',
          fontWeight: '500',
          cursor: 'pointer',
          textDecoration: 'underline',
        }),
      ],
      ['Dismiss'],
    )
  const refused = refusedEdits(model)
  const body = h.main(
    [
      h.Style({
        display: 'grid',
        gap: '0.75rem',
        padding: '1rem 1.25rem',
        color: ink,
        font: '15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif',
      }),
    ],
    [
      // The toolbar: what is shown, where the edits stand, and the offline switch.
      h.header(
        [h.Style({ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' })],
        [
          h.div(
            [],
            [
              h.h1(
                [h.Style({ margin: '0', fontSize: '1.125rem', fontWeight: '600' })],
                ['Products'],
              ),
              h.p(
                [h.Style({ margin: '0', fontSize: '0.8125rem', color: muted })],
                [
                  // Read, not counted: the server has more until a page says it has none.
                  RowCount.match(rows.count, {
                    Known: ({ total }) => `${total.toLocaleString()} products.`,
                    Unknown: ({ atLeast }) =>
                      `${atLeast.toLocaleString()} products read, more to come.`,
                  }),
                ],
              ),
            ],
          ),
          // Always there, so a change is announced; drawn as a pill only when it says something.
          h.p(
            [
              h.Id('exchange'),
              h.Role('status'),
              h.Style(
                status === ''
                  ? { margin: '0' }
                  : {
                      margin: '0',
                      padding: '0.125rem 0.625rem',
                      borderRadius: '999px',
                      background: waiting ? '#fef3c7' : '#f4f4f5',
                      color: waiting ? '#92400e' : muted,
                      fontSize: '0.8125rem',
                    },
              ),
            ],
            [status],
          ),
          h.label(
            [
              h.Style({
                marginInlineStart: 'auto',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontSize: '0.875rem',
                cursor: 'pointer',
                userSelect: 'none',
              }),
            ],
            [
              h.input([
                h.Type('checkbox'),
                h.Checked(model.offline),
                h.OnChange(() => Message.OfflineToggled()),
                h.Style({ width: '1rem', height: '1rem', margin: '0', accentColor: ink }),
              ]),
              'Work offline',
            ],
          ),
        ],
      ),
      // What the server refused, said once per edit with its reason; the cells
      // it had changed show the server's value again, edged in red.
      h.ul(
        [h.Id('refused'), h.AriaLabel('Edits not saved'), h.Style(list(refused.length))],
        refused.map(({ opId, cells, reason }) =>
          h.li(
            [h.Style(notice(refusedTone))],
            [`${cells} not saved: ${reason}. `, dismiss(Message.RefusalDismissed({ opId }))],
          ),
        ),
      ),
      // What another device's later commit replaced: last writer wins, said here.
      h.ul(
        [h.Id('replaced'), h.AriaLabel('Edits replaced'), h.Style(list(model.replaced.length))],
        model.replaced.map(({ id, column, by, was }) =>
          h.li(
            [h.Style(notice(replacedTone))],
            [
              `${columnName(column)} of ${id}: ${by}’s later edit replaced yours (${was}). `,
              dismiss(Message.ReplacementDismissed({ id, column })),
            ],
          ),
        ),
      ),
      Registry(
        {
          state: model.grid,
          rows,
          wrap: message => Message.GotGridMessage({ message }),
          label: 'Products',
          rowHeight: 32,
          headerHeight: 36,
          overscan: { rows: 6, columns: 1 },
          status: GridCrud.status(page),
          onRetry: Message.RetriedProducts(),
          onMore: Message.RequestedMoreProducts(),
          moreOnScroll: true,
          // The orders the query offers; a header asks for one, and the Model reads it.
          // The column clicked, not the order it leads to: two clicks in one frame
          // toggle twice, from the Model as it is, not the order last drawn.
          sort: ProductSort.inputs(model.sort, (_, column) => Message.SortedProducts({ column })),
          columnMenu: true,
          marks: marksOf(model),
        },
        h,
      ),
    ],
  )
  return { title: 'Product registry', body }
}
