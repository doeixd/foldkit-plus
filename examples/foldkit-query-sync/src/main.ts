import { Listbox } from '@foldkit/ui'
import * as UiButton from '@foldkit/ui/button'
import * as UiInput from '@foldkit/ui/input'
import type { AnchorConfig } from '@foldkit/ui/listbox'
import {
  Array,
  Effect,
  Equal,
  Match,
  Option,
  Order,
  Schema,
  SchemaTransformation,
  String,
  type Types,
  pipe,
} from 'effect'
import { Command, Route, type Runtime, Subscription, Update } from 'foldkit'
import { type Document, type Html, type HtmlBuilder, childAttributes } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { UrlRequest, load, pushUrl } from 'foldkit/navigation'
import { defineRouteUnion } from 'foldkit/route'
import { defineTaggedUnion } from 'foldkit/schema'
import { modifyFields } from 'foldkit/struct'
import { Url, toString as urlToString } from 'foldkit/url'
import { Mirror } from 'foldkit-mirror'
import { SlotView, Style, type SlotBuilders } from 'foldkit-mixins'
import { Button, Input } from 'foldkit-mixins-ui'
import { Surface } from 'foldkit-surface'

import { type Dinosaur, dinosaurs } from './data.js'
import { HeaderButtonStyle, PageSlots, PageStyle, SearchStyle } from './style.js'

const Diet = Schema.Literals(['Carnivore', 'Herbivore', 'Omnivore'])
const Period = Schema.Literals(['Triassic', 'Jurassic', 'Cretaceous'])
const SortColumn = Schema.Literals(['Name', 'Period', 'Diet', 'Length', 'Weight'])
type SortColumn = typeof SortColumn.Type

export const Sorting = defineTaggedUnion({
  Unsorted: {},
  Ascending: { column: SortColumn },
  Descending: { column: SortColumn },
})
export type Sorting = typeof Sorting.Type

const dietFilterItems: ReadonlyArray<string> = ['', ...Diet.literals]
const periodFilterItems: ReadonlyArray<string> = ['', ...Period.literals]

// ROUTE

/** The path only: the filters are Model fields, which the `Filters` mirror keeps in the query. */
export const AppRoute = defineRouteUnion({
  Browse: {},
  NotFound: { path: Schema.String },
})
export type AppRoute = typeof AppRoute.Type

const browseRouter = pipe(Route.root, Route.mapTo(AppRoute.Browse))

const urlToAppRoute = Route.parseUrlWithFallback(Route.oneOf(browseRouter), AppRoute.NotFound)

// MODEL

export const Model = Schema.Struct({
  route: AppRoute,
  search: Schema.String,
  sorting: Sorting,
  diet: Schema.Option(Diet),
  period: Schema.Option(Period),
  dietListbox: Listbox.Model,
  periodListbox: Listbox.Model,
})
export type Model = typeof Model.Type

// MESSAGE

export const Message = defineMessageUnion({
  CompletedNavigateInternal: {},
  CompletedLoadExternal: {},
  ClickedLink: { request: UrlRequest },
  ChangedUrl: { url: Url },
  ChangedSearchInput: { value: Schema.String },
  ClickedColumnHeader: { column: SortColumn },
  GotDietListboxMessage: { message: Listbox.Message },
  GotPeriodListboxMessage: { message: Listbox.Message },
})
export type Message = typeof Message.Type

// MIRROR

/** Also the mirror's defaults: a filter at its initial value is left out of the URL. */
export const initialModel: Model = {
  route: AppRoute.Browse(),
  search: '',
  sorting: Sorting.Unsorted(),
  diet: Option.none(),
  period: Option.none(),
  dietListbox: Listbox.init({ id: 'diet-filter' }),
  periodListbox: Listbox.init({ id: 'period-filter' }),
}

const App = Surface.application({ Model, Message })

const SORT_PARAM_SEPARATOR = ':'
const SortDirection = Schema.Literals(['Ascending', 'Descending'])

/**
 * `?diet=Carnivore`. A value that is not one of the literals reads as no
 * filter. `None` encodes as `''`, which never reaches the URL: it is the
 * initial value, and the mirror leaves those out.
 */
const optionParam = <A extends string>(literals: Schema.Codec<A, A>) => {
  const decode = Schema.decodeUnknownOption(literals)

  return Schema.String.pipe(
    Schema.decodeTo(
      Schema.Option(literals),
      SchemaTransformation.transform({
        decode: (text: string): Option.Option<A> => decode(text),
        encode: (maybeValue: Option.Option<A>): string => Option.getOrElse(maybeValue, () => ''),
      }),
    ),
  )
}

/** `?sorting=Length:Ascending`. Anything else reads as `Unsorted`, which encodes as `''`. */
const sortingParam = (() => {
  const decodeColumn = Schema.decodeUnknownOption(SortColumn)
  const decodeDirection = Schema.decodeUnknownOption(SortDirection)

  return Schema.String.pipe(
    Schema.decodeTo(
      Sorting,
      SchemaTransformation.transform({
        decode: (text: string): Sorting => {
          const parts = String.split(text, SORT_PARAM_SEPARATOR)

          return pipe(
            Option.all({
              column: pipe(parts, Array.get(0), Option.flatMap(decodeColumn)),
              direction: pipe(parts, Array.get(1), Option.flatMap(decodeDirection)),
            }),
            Option.map(({ column, direction }) =>
              Match.value(direction).pipe(
                Match.when('Ascending', () => Sorting.Ascending({ column })),
                Match.when('Descending', () => Sorting.Descending({ column })),
                Match.exhaustive,
              ),
            ),
            Option.getOrElse(() => Sorting.Unsorted()),
          )
        },
        encode: (sorting): string =>
          Sorting.match(sorting, {
            Unsorted: () => '',
            Ascending: ({ column }) => `${column}${SORT_PARAM_SEPARATOR}Ascending`,
            Descending: ({ column }) => `${column}${SORT_PARAM_SEPARATOR}Descending`,
          }),
      }),
    ),
  )
})()

/**
 * The four filters, kept in the query string. The Model owns them: `update`
 * changes them, the mirror's Subscription writes the URL after, and
 * `Filters.reduce` reads a URL back on load and on back/forward. Every key
 * replaces the history entry, as upstream's `replaceUrl` did.
 */
export const Filters = Mirror.url(App, {
  name: 'filters',
  initial: initialModel,
  fields: [App.model.search, App.model.sorting, App.model.diet, App.model.period],
  keys: {
    search: { history: 'replace' },
    sorting: { history: 'replace', codec: sortingParam },
    diet: { history: 'replace', codec: optionParam(Diet) },
    period: { history: 'replace', codec: optionParam(Period) },
  },
})

// INIT

/** The route only: `Mirror.routing` reads the filters from the same URL. */
const routeInit: Runtime.RoutingApplicationInit<Model, Message> = (url: Url) => ({
  model: modifyFields(initialModel, { route: () => urlToAppRoute(url) }),
})

// UPDATE

const columnSortDirection = (sorting: Sorting, column: SortColumn): Types.Tags<Sorting> =>
  Sorting.match(sorting, {
    Unsorted: () => 'Unsorted' as const,
    Ascending: ({ column: sortedColumn }) =>
      sortedColumn === column ? ('Ascending' as const) : ('Unsorted' as const),
    Descending: ({ column: sortedColumn }) =>
      sortedColumn === column ? ('Descending' as const) : ('Unsorted' as const),
  })

const nextSorting = (sorting: Sorting, column: SortColumn): Sorting =>
  pipe(
    columnSortDirection(sorting, column),
    Match.value,
    Match.when('Unsorted', () => Sorting.Ascending({ column })),
    Match.when('Ascending', () => Sorting.Descending({ column })),
    Match.when('Descending', () => Sorting.Unsorted()),
    Match.exhaustive,
  )

/** The listbox's `''` item is "All": no filter. */
const selectionToFilter = <A extends string>(
  selectedItem: string,
  literals: Schema.Codec<A, A>,
): Option.Option<A> => Schema.decodeUnknownOption(literals)(selectedItem)

const NavigateInternal = Command.define('NavigateInternal', {
  args: { url: Schema.String },
  messages: [Message.CompletedNavigateInternal],
  execute: ({ url }) => pushUrl(url).pipe(Effect.as(Message.CompletedNavigateInternal())),
})

const LoadExternal = Command.define('LoadExternal', {
  args: { href: Schema.String },
  messages: [Message.CompletedLoadExternal],
  execute: ({ href }) => load(href).pipe(Effect.as(Message.CompletedLoadExternal())),
})

type UpdateReturn = Update.Return<Model, Message>

const DietListbox = Listbox.create<string>()
const PeriodListbox = Listbox.create<string>()

const foldDietListbox = Update.foldChild({
  update: DietListbox.update,
  read: (model: Model) => Option.some(model.dietListbox),
  write: (model, nextDietListbox) => modifyFields(model, { dietListbox: () => nextDietListbox }),
  toParentMessage: message => Message.GotDietListboxMessage({ message }),
  foldOutMessage: Listbox.OutMessage.match<Update.Step<Model, Message>>({
    Selected:
      ({ value }) =>
      model => ({ model: modifyFields(model, { diet: () => selectionToFilter(value, Diet) }) }),
  }),
})

const foldPeriodListbox = Update.foldChild({
  update: PeriodListbox.update,
  read: (model: Model) => Option.some(model.periodListbox),
  write: (model, nextPeriodListbox) =>
    modifyFields(model, { periodListbox: () => nextPeriodListbox }),
  toParentMessage: message => Message.GotPeriodListboxMessage({ message }),
  foldOutMessage: Listbox.OutMessage.match<Update.Step<Model, Message>>({
    Selected:
      ({ value }) =>
      model => ({
        model: modifyFields(model, { period: () => selectionToFilter(value, Period) }),
      }),
  }),
})

const routeUpdate = (model: Model, message: Message) =>
  Message.match<UpdateReturn>(message, {
    CompletedNavigateInternal: () => ({ model }),
    CompletedLoadExternal: () => ({ model }),

    ClickedLink: ({ request }) =>
      UrlRequest.match<UpdateReturn>(request, {
        Internal: ({ url }) => ({
          model,
          commands: [NavigateInternal({ url: urlToString(url) })],
        }),
        External: ({ href }) => ({
          model,
          commands: [LoadExternal({ href })],
        }),
      }),

    // The filters are already read from `url` (`Mirror.routing`). This is also
    // the answer to the mirror's own URL writes, which leave the route as it is,
    // so the Model keeps its identity and nothing renders.
    ChangedUrl: ({ url }) => {
      const nextRoute = urlToAppRoute(url)

      return {
        model: Equal.equals(nextRoute, model.route)
          ? model
          : modifyFields(model, { route: () => nextRoute }),
      }
    },

    ChangedSearchInput: ({ value }) => ({
      model: modifyFields(model, { search: () => value }),
    }),

    ClickedColumnHeader: ({ column }) => ({
      model: modifyFields(model, { sorting: sorting => nextSorting(sorting, column) }),
    }),

    GotDietListboxMessage: ({ message }) => foldDietListbox(model, message),

    GotPeriodListboxMessage: ({ message }) => foldPeriodListbox(model, message),
  })

// ROUTING

/**
 * `init`, `update` and `routing` for `Runtime.makeApplication`: the route is
 * this application's, and the `Filters` mirror reads every URL into the Model
 * before `routeUpdate` sees it.
 */
export const routed = Mirror.routing({
  mirrors: [Filters],
  urlChanged: 'ChangedUrl',
  init: routeInit,
  update: routeUpdate,
  routing: {
    onUrlRequest: request => Message.ClickedLink({ request }),
    onUrlChange: url => Message.ChangedUrl({ url }),
  },
})

export const { init, update } = routed

// SUBSCRIPTION

export const subscriptions = Subscription.make<Model, Message>()(() => ({
  ...Filters.subscriptions,
}))

// VIEW

type Slots = SlotBuilders<typeof PageSlots, Message>

const columnOrders: Record<SortColumn, Order.Order<Dinosaur>> = {
  Name: Order.mapInput(Order.String, ({ name }: Dinosaur) => name),
  Period: Order.mapInput(Order.String, ({ period }: Dinosaur) => period),
  Diet: Order.mapInput(Order.String, ({ diet }: Dinosaur) => diet),
  Length: Order.mapInput(Order.Number, ({ lengthMeters }: Dinosaur) => lengthMeters),
  Weight: Order.mapInput(Order.Number, ({ weightKg }: Dinosaur) => weightKg),
}

const filterWhenSome =
  <A, B>(maybeValue: Option.Option<A>, predicate: (value: A, item: B) => boolean) =>
  (items: ReadonlyArray<B>): ReadonlyArray<B> =>
    Option.match(maybeValue, {
      onNone: () => items,
      onSome: value => Array.filter(items, item => predicate(value, item)),
    })

const sortBySorting =
  <A>(sorting: Sorting, orders: Record<SortColumn, Order.Order<A>>) =>
  (items: ReadonlyArray<A>): ReadonlyArray<A> =>
    Sorting.match(sorting, {
      Unsorted: () => items,
      Ascending: ({ column }) => Array.sort(items, orders[column]),
      Descending: ({ column }) => Array.sort(items, Order.flip(orders[column])),
    })

export const filterAndSort = (model: Model): ReadonlyArray<Dinosaur> =>
  pipe(
    dinosaurs,
    filterWhenSome(Option.liftPredicate(model.search, String.isNonEmpty), (query, dinosaur) =>
      dinosaur.name.toLowerCase().includes(query.toLowerCase()),
    ),
    filterWhenSome(model.diet, (diet, dinosaur) => dinosaur.diet === diet),
    filterWhenSome(model.period, (period, dinosaur) => dinosaur.period === period),
    sortBySorting(model.sorting, columnOrders),
  )

const sortIndicator = (column: SortColumn, sorting: Sorting): string =>
  Match.value(columnSortDirection(sorting, column)).pipe(
    Match.when('Unsorted', () => ''),
    Match.when('Ascending', () => '↑'),
    Match.when('Descending', () => '↓'),
    Match.exhaustive,
  )

const sortAriaLabel = (column: SortColumn, sorting: Sorting): string =>
  Match.value(columnSortDirection(sorting, column)).pipe(
    Match.when('Unsorted', () => `Sort by ${column}`),
    Match.when('Ascending', () => `Sort by ${column}, currently ascending`),
    Match.when('Descending', () => `Sort by ${column}, currently descending`),
    Match.exhaustive,
  )

const ariaSortValue = (column: SortColumn, sorting: Sorting): string =>
  Match.value(columnSortDirection(sorting, column)).pipe(
    Match.when('Unsorted', () => 'none'),
    Match.when('Ascending', () => 'ascending'),
    Match.when('Descending', () => 'descending'),
    Match.exhaustive,
  )

type ColumnConfig = Readonly<{ column: SortColumn; label: string; isNumeric: boolean }>

const columns: ReadonlyArray<ColumnConfig> = [
  { column: 'Name', label: 'Name', isNumeric: false },
  { column: 'Period', label: 'Period', isNumeric: false },
  { column: 'Diet', label: 'Diet', isNumeric: false },
  { column: 'Length', label: 'Length (m)', isNumeric: true },
  { column: 'Weight', label: 'Weight (kg)', isNumeric: true },
]

const sortableColumnHeader = (
  { column, label, isNumeric }: ColumnConfig,
  sorting: Sorting,
  slots: Slots,
  h: HtmlBuilder<Message>,
): Html => {
  const indicator = h.span(slots.sortIndicator.attrs(), [sortIndicator(column, sorting)])
  const text = h.span([], [label])
  const cell = isNumeric ? slots.numericHeaderCell : slots.headerCell

  return h.th(cell.attrs([h.AriaSort(ariaSortValue(column, sorting))]), [
    UiButton.view(
      {
        onClick: Message.ClickedColumnHeader({ column }),
        toView: attributes =>
          h.button(
            [
              ...Button.resolve(attributes, [HeaderButtonStyle.mixin], { input: undefined, h })
                .button,
              h.AriaLabel(sortAriaLabel(column, sorting)),
            ],
            // A right-aligned column keeps its label against the edge.
            isNumeric ? [indicator, text] : [text, indicator],
          ),
      },
      h,
    ),
  ])
}

const badge = (value: string, slots: Slots, h: HtmlBuilder<Message>): Html =>
  h.span(slots.badge.attrs([h.DataAttribute('tone', value)]), [value])

const dinosaurRowView = (dinosaur: Dinosaur, slots: Slots, h: HtmlBuilder<Message>): Html =>
  h.keyed('tr')(dinosaur.name, slots.row.attrs(), [
    h.td(slots.nameCell.attrs(), [dinosaur.name]),
    h.td(slots.cell.attrs(), [badge(dinosaur.period, slots, h)]),
    h.td(slots.cell.attrs(), [badge(dinosaur.diet, slots, h)]),
    h.td(slots.numericCell.attrs(), [dinosaur.lengthMeters.toString()]),
    h.td(slots.numericCell.attrs(), [dinosaur.weightKg.toLocaleString()]),
  ])

const LISTBOX_ANCHOR: AnchorConfig = {
  placement: 'bottom-start',
  gap: 4,
  padding: 8,
}

const chevronDown = (slots: Slots, h: HtmlBuilder<Message>): Html =>
  h.svg(
    [
      ...slots.chevron.attrs(),
      h.AriaHidden(true),
      h.Xmlns('http://www.w3.org/2000/svg'),
      h.Fill('none'),
      h.ViewBox('0 0 24 24'),
      h.StrokeWidth('1.5'),
      h.Stroke('currentColor'),
    ],
    [
      h.path([
        h.StrokeLinecap('round'),
        h.StrokeLinejoin('round'),
        h.D('M19.5 8.25l-7.5 7.5-7.5-7.5'),
      ]),
    ],
  )

const dietLabel = (item: string): string => (String.isEmpty(item) ? 'All Diets' : item)

const periodLabel = (item: string): string => (String.isEmpty(item) ? 'All Periods' : item)

type FilterConfig = Readonly<{
  listbox: Listbox.Model
  view: typeof DietListbox.view
  items: ReadonlyArray<string>
  selected: Option.Option<string>
  itemToLabel: (item: string) => string
  toParentMessage: (message: Listbox.Message) => Message
}>

const filterView = (config: FilterConfig, slots: Slots, h: HtmlBuilder<Message>): Html => {
  const selectedItem = Option.getOrElse(config.selected, () => '')

  return h.submodel({
    slotId: config.listbox.id,
    model: config.listbox,
    view: config.view,
    viewInputs: {
      anchor: LISTBOX_ANCHOR,
      items: config.items,
      maybeSelectedValue: Option.some(selectedItem),
      itemToConfig: item => ({
        content: h.div(slots.filterOption.attrs(), [
          h.span(slots.filterCheck.attrs(), ['✓']),
          h.span([], [config.itemToLabel(item)]),
        ]),
      }),
      itemToSearchText: config.itemToLabel,
      buttonContent: h.div(slots.filterButtonContent.attrs(), [
        h.span([], [config.itemToLabel(selectedItem)]),
        chevronDown(slots, h),
      ]),
      buttonAttributes: childAttributes(slots.filterButton.attrs()),
      itemsAttributes: childAttributes(slots.filterItems.attrs()),
      backdropAttributes: childAttributes(slots.filterBackdrop.attrs()),
      attributes: childAttributes(slots.filter.attrs()),
    },
    toParentMessage: config.toParentMessage,
  })
}

const browseView = (model: Model, slots: Slots, h: HtmlBuilder<Message>): Html => {
  const results = filterAndSort(model)

  return h.div(slots.content.attrs(), [
    h.h1(slots.heading.attrs(), ['Dinosaur Explorer']),
    h.p(slots.intro.attrs(), [
      'Filter, sort, and search. Every control syncs to the URL. Try changing the filters, then copy the URL or hit the back button.',
    ]),

    h.div(slots.controls.attrs(), [
      UiInput.view(
        {
          id: 'dinosaur-search',
          value: model.search,
          placeholder: 'Search by name…',
          onInput: value => Message.ChangedSearchInput({ value }),
          toView: attributes =>
            h.input(Input.resolve(attributes, [SearchStyle.mixin], { input: undefined, h }).input),
        },
        h,
      ),
      filterView(
        {
          listbox: model.dietListbox,
          view: DietListbox.view,
          items: dietFilterItems,
          selected: model.diet,
          itemToLabel: dietLabel,
          toParentMessage: message => Message.GotDietListboxMessage({ message }),
        },
        slots,
        h,
      ),
      filterView(
        {
          listbox: model.periodListbox,
          view: PeriodListbox.view,
          items: periodFilterItems,
          selected: model.period,
          itemToLabel: periodLabel,
          toParentMessage: message => Message.GotPeriodListboxMessage({ message }),
        },
        slots,
        h,
      ),
    ]),

    h.p(slots.count.attrs(), [
      `Showing ${Array.length(results)} of ${Array.length(dinosaurs)} dinosaurs`,
    ]),

    Array.match(results, {
      onEmpty: () =>
        h.div(slots.empty.attrs(), [
          h.p(slots.emptyTitle.attrs(), ['No dinosaurs match your filters.']),
          h.p(slots.emptyHint.attrs(), ['Try broadening your search or removing filters.']),
        ]),
      onNonEmpty: rows =>
        h.div(slots.tableFrame.attrs(), [
          h.table(slots.table.attrs(), [
            h.thead(slots.head.attrs(), [
              h.tr(
                [],
                columns.map(config => sortableColumnHeader(config, model.sorting, slots, h)),
              ),
            ]),
            h.tbody(
              [],
              rows.map(row => dinosaurRowView(row, slots, h)),
            ),
          ]),
        ]),
    }),

    h.p(slots.footnote.attrs(), [
      'All filter and sort state lives in the URL. Share it or bookmark it.',
    ]),
  ])
}

const notFoundView = (path: string, slots: Slots, h: HtmlBuilder<Message>): Html =>
  h.div(slots.notFound.attrs(), [
    h.h1(slots.notFoundHeading.attrs(), ['404 — Page Not Found']),
    h.p(slots.notFoundText.attrs(), [`The path "${path}" was not found.`]),
    h.a(slots.backLink.attrs([h.Href(browseRouter())]), ['← Back to Dinosaur Explorer']),
  ])

const Page = SlotView.forMessages<Message>()
  .define(PageSlots, (model: Model, slots, h) =>
    h.div(slots.page.attrs(), [
      h.header(slots.header.attrs(), [
        h.div(slots.headerInner.attrs(), [
          h.span(slots.brand.attrs(), ['foldkit']),
          h.span(slots.tagline.attrs(), ['query-sync example']),
        ]),
      ]),
      h.main(slots.main.attrs(), [
        AppRoute.match(model.route, {
          Browse: () => browseView(model, slots, h),
          NotFound: ({ path }) => notFoundView(path, slots, h),
        }),
      ]),
    ]),
  )
  .pipe(Style.attach(PageStyle))

const routeTitle = (route: AppRoute): string =>
  AppRoute.match(route, {
    Browse: () => 'Dinosaur Explorer',
    NotFound: () => 'Not Found | Dinosaur Explorer',
  })

export const view = (model: Model, h: HtmlBuilder<Message>): Document => ({
  title: routeTitle(model.route),
  body: Page(model, h),
})
