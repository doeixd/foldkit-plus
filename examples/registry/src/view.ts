/**
 * The page: a status line, a strip of what is read and drawn, the panel that
 * says who owns what, and the grid over the list's page. The rows, their
 * status and the order are read from Remote and the Model on every render;
 * the grid draws only what is in view.
 */
import { Option } from 'effect'
import type { Document, HtmlBuilder } from 'foldkit/html'
import type { ModuleManifest } from 'foldkit-surface'
import { RowCount } from 'foldkit-data-grid'
import { GridCrud } from 'foldkit-data-grid/crud'
import { Style } from 'foldkit-mixins'
import {
  DataGridView,
  GridLegend,
  GridLegendStyle,
  GridMarkStyle,
  GridSlots,
  GridStyle,
  MoreOnScroll,
} from 'foldkit-mixins-data-grid'
import { Grid, Message, Products, exchangeOf, geometryOf, marksOf, type Model } from './app.js'
import type { EditedColumn } from './domain.js'
import { ProductSort } from './operations.js'
import { ownershipPanel } from './ownership.js'
import { hairline, ink, muted } from './palette.js'

const Registry = DataGridView<Message>()
  .define(Grid)
  .pipe(
    Style.attach(GridStyle),
    // The shared marks, after GridStyle, whose plain dot they replace by name.
    Style.attach(GridMarkStyle),
    Style.attach(
      Style.forSlots(GridSlots)({
        root: Style.inline({
          height: 'calc(100vh - 9rem)',
          minHeight: '20rem',
          border: `1px solid ${hairline}`,
          borderRadius: '10px',
          boxShadow: '0 1px 2px rgb(0 0 0 / 0.04)',
        }),
      }),
    ),
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
const refusedTone = {
  border: 'light-dark(#fecaca, #7f1d1d)',
  background: 'light-dark(#fef2f2, #2a1414)',
}
const replacedTone = {
  border: 'light-dark(#fde68a, #78350f)',
  background: 'light-dark(#fffbeb, #2a1f0a)',
}

/** A list of notices, not drawn at all while it has none, so it adds no gap. */
const list = (count: number) =>
  ({
    listStyle: 'none',
    margin: '0',
    padding: '0',
    display: count === 0 ? 'none' : 'grid',
    gap: '0.5rem',
  }) as const

/** The page, with the panel listing `manifest`'s owners. */
export const view = (model: Model, h: HtmlBuilder<Message>, manifest: ModuleManifest): Document => {
  const page = Products.page(model)
  const status = exchangeOf(model)
  // What the grid is drawn from, given to the grid and to the count of what it draws.
  const geometry = geometryOf(model)
  const { rows } = geometry
  const shown = Grid.window(geometry)
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
                [h.Id('counts'), h.Style({ margin: '0', fontSize: '0.8125rem', color: muted })],
                [
                  // Read, not counted: the server has more until a page says it has none.
                  // Drawn is the grid's own window, not an estimate.
                  [
                    RowCount.match(rows.count, {
                      Known: ({ total }) => `${total.toLocaleString()} products`,
                      Unknown: ({ atLeast }) => `${atLeast.toLocaleString()} read, more to come`,
                    }),
                    `${(shown.rows.end - shown.rows.start).toLocaleString()} rows drawn`,
                  ].join(' · '),
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
                      background: waiting
                        ? 'light-dark(#fef3c7, #3b2a0a)'
                        : 'var(--fk-surface-muted)',
                      color: waiting ? 'light-dark(#92400e, #fcd34d)' : muted,
                      fontSize: '0.8125rem',
                    },
              ),
            ],
            [status],
          ),
          // The query's input: the server filters, over every product, not the page read.
          h.input([
            h.Type('search'),
            h.Id('search'),
            h.AriaLabel('Search descriptions'),
            h.Placeholder('Search descriptions'),
            h.Value(model.search),
            h.OnInput(text => Message.SearchChanged({ text })),
            h.Style({
              marginInlineStart: 'auto',
              inlineSize: 'min(16rem, 100%)',
              padding: '0.375rem 0.625rem',
              border: `1px solid ${hairline}`,
              borderRadius: '8px',
              background: 'transparent',
              color: ink,
              font: 'inherit',
              fontSize: '0.875rem',
            }),
          ]),
          h.label(
            [
              h.Style({
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
      Legend({}, h),
      ownershipPanel(manifest, model, shown, h),
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
              `${columnName(column)} of ${id}: ${Option.match(by, {
                onSome: name => `${name}’s later edit`,
                onNone: () => 'a later edit',
              })} replaced yours (${was}). `,
              dismiss(Message.ReplacementDismissed({ id, column })),
            ],
          ),
        ),
      ),
      // What an undo or a redo left alone: a cell changed since is not overwritten.
      h.ul(
        [
          h.Id('held-back'),
          h.AriaLabel('Cells left alone'),
          h.Style(list(Option.isSome(model.heldBack) ? 1 : 0)),
        ],
        Option.match(model.heldBack, {
          onNone: () => [],
          onSome: ({ by, cells }) => [
            h.li(
              [h.Style(notice(replacedTone))],
              [
                `${cells.map(({ id, column }) => `${columnName(column)} of ${id}`).join(', ')} changed since; not ${by === 'undo' ? 'undone' : 'redone'}. `,
                dismiss(Message.HeldBackDismissed()),
              ],
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
    ],
  )
  return { title: 'Product registry', body }
}
