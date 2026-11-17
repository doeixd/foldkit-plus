import { Recipes, TableSlots } from 'foldkit-mixins-ui'
import * as Snippet from '../../snippets/components.js'
import * as Widgets from '../widgets.js'
import { about } from '../catalogue.js'
import { fromRecipe, inert } from '../define.js'

export const showcase = fromRecipe(
  about('table'),
  TableSlots,
  Recipes.Table,
  style => Snippet.table(style, inert),
  undefined,
  [
    { name: 'basic', title: 'Basic', draw: style => Snippet.table(style, inert) },
    {
      name: 'sortable',
      title: 'Sortable headings',
      draw: (style, live) =>
        Snippet.tableSortable(
          style,
          live.widgets.invoiceSort,
          column => live.onWidget(Widgets.Message.SortedInvoices({ column })),
          live.h,
        ),
    },
    {
      name: 'selection',
      title: 'Row selection',
      draw: (style, live) =>
        Snippet.tableSelection(
          style,
          live.widgets.invoicesChosen,
          (id, selected) => live.onWidget(Widgets.Message.ChoseInvoice({ id, selected })),
          ids => live.onWidget(Widgets.Message.ChoseInvoices({ ids })),
          live.h,
        ),
    },
    {
      name: 'expandable',
      title: 'Expandable rows',
      draw: (style, live) =>
        Snippet.tableExpandable(
          style,
          live.widgets.invoicesOpen,
          (id, expanded) => live.onWidget(Widgets.Message.OpenedInvoice({ id, expanded })),
          live.h,
        ),
    },
    { name: 'empty', title: 'Empty', draw: style => Snippet.tableEmpty(style, inert) },
    {
      name: 'sticky',
      title: 'Sticky header, striped',
      draw: style => Snippet.tableSticky(style, inert),
      pins: { header: 'sticky', rows: 'striped', density: 'compact' },
    },
  ],
)
