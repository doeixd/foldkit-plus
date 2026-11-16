import type { Html, HtmlBuilder } from 'foldkit/html'
import type { NamedStyle } from 'foldkit-mixins'
import { PaginationSlots, Recipes } from 'foldkit-mixins-ui'
import * as Snippet from '../../snippets/components.js'
import * as Widgets from '../widgets.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'
import type { Live } from '../showcase.js'

/** A pagination example on its own page of the widgets' Model. */
const paged =
  (
    draw: <Message>(
      style: NamedStyle<typeof PaginationSlots>,
      page: number,
      onPage: (page: number) => Message,
      h: HtmlBuilder<Message>,
    ) => Html,
    example: Widgets.PaginationExample,
  ) =>
  <Message>(style: NamedStyle<typeof PaginationSlots>, live: Live<Message>): Html =>
    draw(
      style,
      live.widgets.pages[example],
      page => live.onWidget(Widgets.Message.ChosePage({ example, page })),
      live.h,
    )

export const showcase = fromRecipe(
  about('pagination'),
  PaginationSlots,
  Recipes.Pagination,
  paged(Snippet.pagination, 'numbered'),
  undefined,
  [
    { name: 'numbered', title: 'Numbered', draw: paged(Snippet.pagination, 'numbered') },
    {
      name: 'simple',
      title: 'Previous and next',
      draw: paged(Snippet.paginationSimple, 'simple'),
    },
    { name: 'ends', title: 'First and last', draw: paged(Snippet.paginationEnds, 'ends') },
    {
      name: 'range',
      title: 'Rows and page size',
      draw: (style, live) =>
        Snippet.paginationRange(
          style,
          { page: live.widgets.pages.range, perPage: live.widgets.perPage },
          page => live.onWidget(Widgets.Message.ChosePage({ example: 'range', page })),
          perPage => live.onWidget(Widgets.Message.ChosePerPage({ perPage })),
          live.h,
        ),
    },
    {
      name: 'siblings',
      title: 'Siblings and boundaries',
      draw: paged(Snippet.paginationSiblings, 'siblings'),
    },
    {
      name: 'compact',
      title: 'Compact',
      pins: { compact: 'always' },
      draw: paged(Snippet.paginationCompact, 'compact'),
    },
    { name: 'words', title: 'Words of your own', draw: paged(Snippet.paginationWords, 'words') },
    {
      name: 'one-page',
      title: 'One page',
      draw: (style, live) =>
        Snippet.paginationOnePage(
          style,
          page => live.onWidget(Widgets.Message.ChosePage({ example: 'words', page })),
          live.h,
        ),
    },
  ],
)
