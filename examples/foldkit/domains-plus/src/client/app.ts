/**
 * The application: one Model, one Message union (`message.ts`), one
 * `update`. The search text is the Model's `query`, which `foldkit-mirror`
 * keeps in `?q=`; the label the reads use is `settledLabel`, which the
 * debounce moves once the text rests.
 */
import * as UiDialog from '@foldkit/ui/dialog'
import * as UiListbox from '@foldkit/ui/listbox'
import { Array, Option, Schema, String } from 'effect'
import * as Command from 'foldkit/command'
import { UrlRequest } from 'foldkit/navigation'
import { modifyFields } from 'foldkit/struct'
import type * as Update from 'foldkit/update'
import { Url, toString as urlToString } from 'foldkit/url'
import { Bundle } from 'foldkit-bundle'
import { Mirror } from 'foldkit-mirror'
import { ListboxView, Sheet, WindowList } from 'foldkit-mixins-ui'
import { Remote, RemoteData, RemotePolicy, type RemoteClient } from 'foldkit-remote'
import { SSR } from 'foldkit-ssr/client'
import { Projection, Surface } from 'foldkit-surface'
import { type Domain as DomainValue, DomainLabel, queryToMaybeDomainLabel } from '../shared/domain'
import { Domain, Quote } from '../shared/entity'
import {
  DismissSearchKeyboard,
  FocusCartButton,
  FocusCartCloseButton,
  FocusFiltersButton,
  FocusSearchInput,
  FocusTldFilterButton,
  LoadExternal,
  NavigateInternal,
  RevealResultsListStart,
  ScrollPageToTop,
} from './command.js'
import {
  AvailabilityFilter,
  Cart,
  SortOrder,
  TOP_RESULT_COUNT,
  TldFilter,
  isCompleteCatalogRequired,
} from './domain'
import { Message, Own, Search, SearchInput } from './message.js'
import { arrangedOf, namesOf } from './results.js'
import { initResultsList } from './resultsList.js'
import { AppRoute, routeOf } from './site.js'

export { Message }

/**
 * Whether the search box stands in the hero (`Landing`) or in the header
 * (`Search`). It turns to `Search` with the first search and stays there.
 */
export const SearchLayout = Schema.Literals(['Landing', 'Search'])
export type SearchLayout = typeof SearchLayout.Type

export const Model = Schema.Struct({
  ...Search.fields,
  route: AppRoute,
  /** What the search box holds, keystroke by keystroke. */
  query: Schema.String,
  /** The label the reads use: the query's, once it has rested. */
  settledLabel: Schema.OptionFromNullOr(DomainLabel),
  searchLayout: SearchLayout,
  /** The prices read so far, by name: Remote's store. */
  remote: Remote.Model,
  /** All Results' window over the page: which rows are drawn, and their heights. */
  resultsList: WindowList.Model,
  tldFilter: TldFilter,
  availabilityFilter: AvailabilityFilter,
  sortOrder: SortOrder,
  /** The desktop's dropdowns: the TLD, with typeahead over the catalog, availability and sort. */
  tldListbox: UiListbox.Model,
  availabilityListbox: UiListbox.Model,
  sortListbox: UiListbox.Model,
  /** The phone's TLD sheet, searched by `tldSearchQuery`. */
  tldSheet: Sheet.Model,
  tldSearchQuery: Schema.String,
  /** The phone's one sheet for availability and sort, as upstream's "Filters and sort". */
  filtersSheet: Sheet.Model,
  /** The domains added, in the order added: the page's, sent nowhere and forgotten on a reload. */
  cart: Cart.Cart,
  /** The cart, a sheet at the window's right edge. */
  cartSheet: Sheet.Model,
})
export type Model = typeof Model.Type

type Return = Update.Return<Model, Message, RemoteClient>

/** A keystroke for the debounce, which settles it 150 ms after the last one. */
const typed = (model: Model, value: string): Return =>
  update(model, Message.GotSearchMessage({ message: SearchInput.Message.Changed({ value }) }))

const layoutFor = (model: Model, query: string): SearchLayout =>
  String.isNonEmpty(query) ? 'Search' : model.searchLayout

/** The search box emptied: nothing is read, now, not after the debounce, and the page is back at its top. */
const cleared = (model: Model): Return => {
  const next = typed(
    modifyFields(model, { query: () => '', settledLabel: () => Option.none() }),
    '',
  )
  return { model: next.model, commands: [...(next.commands ?? []), ScrollPageToTop()] }
}

/** A dropdown's row: the value it chooses, what it shows, and what typeahead matches. */
export interface DropdownOption {
  readonly value: string
  readonly label: string
  readonly searchText: string
}

/** The desktop's dropdowns: upstream's Listbox `update`, drawn by `foldkit-mixins-ui`. */
export const Dropdown = ListboxView.create<DropdownOption, string>()

const isTld = Schema.is(TldFilter)
const isAvailability = Schema.is(AvailabilityFilter)
const isSort = Schema.is(SortOrder)

/** Where a dropdown or a sheet lives in the Model, and the page's Message that carries its own. */
interface Part<Value, PartMessage> {
  readonly get: (model: Model) => Value
  readonly put: (model: Model, value: Value) => Model
  readonly wrap: (message: PartMessage) => Message
}

/**
 * A dropdown's step: its Model put back, its Commands under the page's
 * Message, and a value it chose set with `choose`. A Listbox hands back a
 * string, so `choose` keeps only one of its options.
 */
const dropdownStep = (
  model: Model,
  message: UiListbox.Message,
  part: Part<UiListbox.Model, UiListbox.Message>,
  choose: (model: Model, value: string) => Model,
): Return => {
  const next = Dropdown.update(part.get(model), message)
  const stepped = next.model === part.get(model) ? model : part.put(model, next.model)
  return {
    model: next.outMessage === undefined ? stepped : choose(stepped, next.outMessage.value),
    commands: Command.mapMessages(next.commands ?? [], part.wrap),
  }
}

const tldDropdown: Part<UiListbox.Model, UiListbox.Message> = {
  get: model => model.tldListbox,
  put: (model, listbox) => modifyFields(model, { tldListbox: () => listbox }),
  wrap: message => Message.GotTldListboxMessage({ message }),
}
const availabilityDropdown: Part<UiListbox.Model, UiListbox.Message> = {
  get: model => model.availabilityListbox,
  put: (model, listbox) => modifyFields(model, { availabilityListbox: () => listbox }),
  wrap: message => Message.GotAvailabilityListboxMessage({ message }),
}
const sortDropdown: Part<UiListbox.Model, UiListbox.Message> = {
  get: model => model.sortListbox,
  put: (model, listbox) => modifyFields(model, { sortListbox: () => listbox }),
  wrap: message => Message.GotSortListboxMessage({ message }),
}

const chooseTld = (model: Model, value: string): Model =>
  isTld(value) ? modifyFields(model, { tldFilter: () => value }) : model
const chooseAvailability = (model: Model, value: string): Model =>
  isAvailability(value) ? modifyFields(model, { availabilityFilter: () => value }) : model
const chooseSort = (model: Model, value: string): Model =>
  isSort(value) ? modifyFields(model, { sortOrder: () => value }) : model

/**
 * A sheet's step, its Commands under the page's Message. Closed, it gives
 * focus back to the button that opened it, as upstream's do: a tap does not
 * focus a button in every browser, so there may be nothing else to go back to.
 */
const sheetStep = (
  model: Model,
  next: Sheet.Return,
  part: Part<Sheet.Model, Sheet.Message>,
  focusBack: Command.Command<Message>,
): Return => ({
  model: next.model === part.get(model) ? model : part.put(model, next.model),
  commands: [
    ...Command.mapMessages(next.commands ?? [], part.wrap),
    ...Option.match(Option.fromNullishOr(next.outMessage), {
      onNone: () => [],
      onSome: UiDialog.OutMessage.match({ Opened: () => [], Closed: () => [focusBack] }),
    }),
  ],
})

const cartSheet: Part<Sheet.Model, Sheet.Message> = {
  get: model => model.cartSheet,
  put: (model, sheet) => modifyFields(model, { cartSheet: () => sheet }),
  wrap: message => Message.GotCartSheetMessage({ message }),
}
const tldSheet: Part<Sheet.Model, Sheet.Message> = {
  get: model => model.tldSheet,
  put: (model, sheet) => modifyFields(model, { tldSheet: () => sheet }),
  wrap: message => Message.GotTldSheetMessage({ message }),
}
const filtersSheet: Part<Sheet.Model, Sheet.Message> = {
  get: model => model.filtersSheet,
  put: (model, sheet) => modifyFields(model, { filtersSheet: () => sheet }),
  wrap: message => Message.GotFiltersSheetMessage({ message }),
}

const cartSheetStep = (model: Model, next: Sheet.Return): Return =>
  sheetStep(model, next, cartSheet, FocusCartButton())
const tldSheetStep = (model: Model, next: Sheet.Return): Return =>
  sheetStep(model, next, tldSheet, FocusTldFilterButton())
const filtersSheetStep = (model: Model, next: Sheet.Return): Return =>
  sheetStep(model, next, filtersSheet, FocusFiltersButton())

/**
 * Rows not yet measured take the height of the rows just measured: a row of
 * six names is one height on a desktop and three times it on a phone, and a
 * fixed estimate made the list's length change as rows were drawn (#381).
 */
const estimatedFromMeasured = (list: WindowList.Model, message: WindowList.Message) =>
  WindowList.Message.match(message, {
    Placed: () => list,
    Measured: ({ rows }) => {
      if (rows.length === 0) return list
      const mean = rows.reduce((sum, row) => sum + row.height, 0) / rows.length
      return mean === list.estimatedHeight
        ? list
        : modifyFields(list, { estimatedHeight: () => mean })
    },
  })

const withoutDomain = (name: string) => (cart: Cart.Cart) =>
  Array.filter(cart, domain => domain.name !== name)

/** The page's own Messages; the debounce's and Remote's are their placements'. */
const own = (model: Model, message: Own): Return =>
  Own.match(message, {
    // Only what failed is asked for again; what was read stays on the page.
    ClickedRetrySearch: () => ({
      model: Data.refresh(model, actives, { failed: true }),
      commands: [FocusSearchInput()],
    }),
    UpdatedSearch: ({ value }) =>
      typed(
        modifyFields(model, {
          query: () => value,
          searchLayout: () => layoutFor(model, value),
        }),
        value,
      ),
    // Enter reads what is typed at once, without waiting for the debounce.
    SubmittedSearch: () => ({
      model: modifyFields(model, { settledLabel: () => queryToMaybeDomainLabel(model.query) }),
      commands: [DismissSearchKeyboard()],
    }),
    PressedEscape: () => cleared(model),
    ClickedClearSearch: () => {
      const next = cleared(model)
      return { model: next.model, commands: [...(next.commands ?? []), FocusSearchInput()] }
    },
    ClickedLink: ({ request }) => ({
      model,
      commands: [
        UrlRequest.match(request, {
          Internal: ({ url }) => NavigateInternal({ url: urlToString(url) }),
          External: ({ href }) => LoadExternal({ href }),
        }),
      ],
    }),
    // The mirror has read `?q=` into `query` before this. The search box's
    // own writes come back here too, with `query` what was typed, which the
    // debounce already holds: nothing to do. A query the debounce has not
    // seen came from the address (back, forward, a link), and goes through
    // it like a keystroke, as upstream's search waits its 150 ms.
    ChangedUrl: ({ url }) => {
      const route = routeOf(url)
      const routed =
        route._tag === model.route._tag ? model : modifyFields(model, { route: () => route })
      if (model.search.latest === model.query) return { model: routed }
      return String.isEmpty(routed.query)
        ? cleared(routed)
        : typed(
            modifyFields(routed, { searchLayout: () => layoutFor(routed, routed.query) }),
            routed.query,
          )
    },
    GotTldListboxMessage: ({ message }) => dropdownStep(model, message, tldDropdown, chooseTld),
    GotAvailabilityListboxMessage: ({ message }) =>
      dropdownStep(model, message, availabilityDropdown, chooseAvailability),
    GotSortListboxMessage: ({ message }) => dropdownStep(model, message, sortDropdown, chooseSort),
    GotFiltersSheetMessage: ({ message }) =>
      filtersSheetStep(model, Sheet.update(model.filtersSheet, message)),
    ClickedFilters: () => filtersSheetStep(model, Sheet.open(model.filtersSheet)),
    // A choice in the phone's sheet applies and closes it, as upstream's.
    ClickedMobileAvailabilityOption: ({ value }) =>
      filtersSheetStep(
        modifyFields(model, { availabilityFilter: () => value }),
        Sheet.close(model.filtersSheet),
      ),
    ClickedMobileSortOption: ({ value }) =>
      filtersSheetStep(
        modifyFields(model, { sortOrder: () => value }),
        Sheet.close(model.filtersSheet),
      ),
    GotTldSheetMessage: ({ message }) => tldSheetStep(model, Sheet.update(model.tldSheet, message)),
    ClickedTldFilter: () =>
      tldSheetStep(modifyFields(model, { tldSearchQuery: () => '' }), Sheet.open(model.tldSheet)),
    UpdatedTldSearch: ({ value }) => ({
      model: modifyFields(model, { tldSearchQuery: () => value }),
    }),
    ClickedMobileTldOption: ({ value }) =>
      tldSheetStep(modifyFields(model, { tldFilter: () => value }), Sheet.close(model.tldSheet)),
    ClickedAddDomain: ({ domain }) =>
      Array.some(model.cart, ({ name }) => name === domain.name)
        ? { model }
        : { model: modifyFields(model, { cart: cart => Array.append(cart, domain) }) },
    ClickedRemoveDomain: ({ name }) => ({
      model: modifyFields(model, { cart: withoutDomain(name) }),
    }),
    ClickedRemoveCartDomain: ({ name }) => ({
      model: modifyFields(model, { cart: withoutDomain(name) }),
      commands: [FocusCartCloseButton()],
    }),
    ClickedCart: () => cartSheetStep(model, Sheet.open(model.cartSheet)),
    GotCartSheetMessage: ({ message }) =>
      cartSheetStep(model, Sheet.update(model.cartSheet, message)),
    CompletedFocusCartButton: () => ({ model }),
    CompletedFocusCartCloseButton: () => ({ model }),
    CompletedFocusFiltersButton: () => ({ model }),
    CompletedFocusTldFilterButton: () => ({ model }),
    GotResultsListMessage: ({ message }) => {
      const next = estimatedFromMeasured(
        WindowList.update(model.resultsList, message).model,
        message,
      )
      return {
        model:
          next === model.resultsList ? model : modifyFields(model, { resultsList: () => next }),
      }
    },
    FocusedResultsList: () => ({ model, commands: [RevealResultsListStart()] }),
    CompletedRevealResultsListStart: () => ({ model }),
    CompletedNavigateInternal: () => ({ model }),
    CompletedLoadExternal: () => ({ model }),
    CompletedFocusSearchInput: () => ({ model }),
    CompletedDismissSearchKeyboard: () => ({ model }),
    CompletedScrollPageToTop: () => ({ model }),
    // Their focus moves with the press itself (`focusSelector`), as upstream's.
    ClickedDomainsHome: () => ({ model }),
    ClickedSkipToMain: () => ({ model }),
  })

/** Every result shown in relevance order, and the controls that change it closed. */
const filtersInitial = () => ({
  tldFilter: 'All' as const,
  availabilityFilter: 'All' as const,
  sortOrder: 'Relevance' as const,
  tldListbox: UiListbox.init({ id: 'tld-filter' }),
  availabilityListbox: UiListbox.init({ id: 'availability-filter' }),
  sortListbox: UiListbox.init({ id: 'sort-order' }),
  tldSheet: Sheet.init({ id: 'tld-sheet', side: 'bottom' }),
  tldSearchQuery: '',
  filtersSheet: Sheet.init({ id: 'filters-sheet', side: 'bottom' }),
  cart: [],
  cartSheet: Sheet.init({ id: 'domains-cart', side: 'right' }),
})

/** How long the search text rests before it is read. */
const SETTLE_MS = 150

/**
 * The empty search page, built before the assembly below: the mirror reads
 * its defaults from it, and the debounce's slice is its own `init`'s.
 */
const empty: Model = {
  search: SearchInput.init({ delayMs: SETTLE_MS }).model,
  remote: Remote.initial,
  resultsList: initResultsList(),
  ...filtersInitial(),
  route: AppRoute.Search(),
  query: '',
  settledLabel: Option.none(),
  searchLayout: 'Landing',
}

export const App = Surface.application({ Model, Message })

/** `?q=`: the search text, replaced as it is typed, so typing makes no history. */
export const QueryInUrl = Mirror.url(App, {
  name: 'query',
  fields: [App.model.query],
  keys: { query: { key: 'q', history: 'replace' } },
  // Written with each keystroke, as upstream's Command writes it, so a reload
  // right after typing opens what was typed; a replace makes no history to
  // rate-limit.
  throttle: 0,
  initial: empty,
})

/** The prices, a server's facts read by name and kept in the Model. */
export const Data = Remote.make({
  model: App.model.remote,
  entities: [Domain],
  // Nothing here writes, so nothing is predicted; `Trace.run` refuses a domain without it (#368).
  verifyPredictions: import.meta.env.DEV === true,
})

/** A read of each of `names`, keyed by the name. */
const readsOf = (names: ReadonlyArray<string>) =>
  Object.fromEntries(Array.map(names, name => [name, Data.get(Quote, name)]))

/** What a read shows: its value, or the last one before it failed. */
const shown = (data: RemoteData<DomainValue>): ReadonlyArray<DomainValue> =>
  RemoteData.match(data, {
    Initial: () => [],
    Loading: () => [],
    Ready: value => [value],
    Refreshing: value => [value],
    Failed: (_error, previous) => Option.toArray(previous),
    NotFound: () => [],
  })

/** Every name of `label` read so far, in upstream's order: what is checked. */
export const answeredOf = (model: Model, label: string): ReadonlyArray<DomainValue> =>
  Array.flatMap(namesOf(label), name => shown(Data.get(Quote, name).read(model)))

/** All Results for `label`, as the Model's filters and sort arrange it. */
export const arrangementOf = (model: Model, label: string) =>
  arrangedOf(label, model, answeredOf(model, label))

/** The four Top Results: read first, as upstream's first request. */
export const TopResults = App.surface('TopResults', {
  params: { label: Schema.String },
  model: ({ params }) => readsOf(Array.take(namesOf(params.label), TOP_RESULT_COUNT)),
})

/** The rows of All Results in view of the window, and two more at each end. */
export const VisibleResults = App.surface('VisibleResults', {
  params: { names: Schema.Array(Schema.String) },
  model: ({ params }) => readsOf(params.names),
})

/**
 * Every name of the label, read while the Available filter or a price sort
 * is chosen: neither can be shown in order before every price is known.
 */
export const WholeCatalog = App.surface('WholeCatalog', {
  params: { label: Schema.String },
  model: ({ params }) => readsOf(namesOf(params.label)),
})

const needsWholeCatalog = (model: Model): boolean =>
  isCompleteCatalogRequired(model.availabilityFilter, model.sortOrder)

/** The names in the rows the list draws, for the label the reads use. */
export const visibleNames = (model: Model, label: string): ReadonlyArray<string> => {
  const { groups, keys } = arrangementOf(model, label)
  const { start, end } = WindowList.windowOf(model.resultsList, keys)
  return Array.flatMap(groups.slice(start, end), group => group.listings.map(({ name }) => name))
}

/** The names the page reads now, of the settled label: the Top Results, the rows in view, and every name when the filters need them all. */
export const readNames = (model: Model): ReadonlyArray<string> =>
  Option.match(model.settledLabel, {
    onNone: () => [],
    onSome: label =>
      needsWholeCatalog(model)
        ? namesOf(label)
        : Array.dedupe([
            ...Array.take(namesOf(label), TOP_RESULT_COUNT),
            ...visibleNames(model, label),
          ]),
  })

/** Every read the page makes, each while the settled label is a name. */
export const actives = {
  top: Surface.at(TopResults, (model: Model) =>
    Option.map(model.settledLabel, label => ({ label })),
  ),
  visible: Surface.at(VisibleResults, (model: Model) =>
    Option.map(model.settledLabel, label => ({ names: visibleNames(model, label) })),
  ),
  whole: Surface.at(WholeCatalog, (model: Model) =>
    Option.filter(
      Option.map(model.settledLabel, label => ({ label })),
      () => needsWholeCatalog(model),
    ),
  ),
}

/**
 * A name read within the minute is drawn from the store and asks nothing,
 * as upstream's one-minute cache: backspacing to an earlier search shows it
 * at once. Read after that, it shows while it is read again.
 */
export const freshness = RemotePolicy.staleWhileRevalidate({ maxAge: 60_000 })

const Page = Bundle.parent({ Model, Message }).withServices<RemoteClient>()

const Settled = Page.at(Search, {
  args: { delayMs: SETTLE_MS },
  // The debounce drops the timer of a text typed over, so what rests is the box's.
  onOut:
    ({ value }) =>
    (model: Model): Return => {
      const label = queryToMaybeDomainLabel(value)
      // Rows of another label are never drawn again: their heights go with them.
      const same = Option.makeEquivalence(String.Equivalence)(label, model.settledLabel)
      return {
        model: modifyFields(model, {
          settledLabel: () => label,
          resultsList: list => (same ? list : WindowList.keep(list, [])),
        }),
      }
    },
})

const placements = Page.assemble(
  QueryInUrl.wiring('ChangedUrl'),
  Settled,
  Data.wiring(actives, { policy: freshness, grace: '1 minute' }),
)

export const update = placements.update(own)

/** The page at `route` with `query` in its box, read at once: the server's first render. */
const start = (route: AppRoute, query: string): Return =>
  placements.initial({
    route,
    query,
    settledLabel: queryToMaybeDomainLabel(query),
    searchLayout: String.isNonEmpty(query) ? 'Search' : 'Landing',
    remote: Remote.initial,
    resultsList: initResultsList(),
    ...filtersInitial(),
  })

/** The page at `url`, as the server renders it; the browser resumes from it. */
export const init = (url: Url): Return => start(routeOf(url), QueryInUrl.reduce(empty, url).query)

export const subscriptions = placements.subscriptions()

/** The search box: what it shows, and the Message typing into it sends. */
export const SearchBox = App.surface('SearchBox', {
  model: ({ model }) => ({ query: model.query }),
  messages: [Message.UpdatedSearch],
})

/**
 * What crosses from the server's render to the browser, which starts from it
 * instead of running `init`. The debounce starts empty in the browser.
 */
export const plan = SSR.plan(
  { owner: App.owner, Message, initial: empty },
  {
    id: 'domains',
    state: Projection.pick(
      App.model.route,
      App.model.query,
      App.model.settledLabel,
      App.model.searchLayout,
    ),
    // Prices are read again in the browser, as upstream's are: none is inlined.
    local: [App.model.search, App.model.remote, App.model.resultsList],
    surfaces: [Surface.at(SearchBox, undefined)],
  },
)

/** Foldkit's link and address handlers. */
export const routing = {
  onUrlRequest: (request: UrlRequest) => Message.ClickedLink({ request }),
  onUrlChange: (url: Url) => Message.ChangedUrl({ url }),
}
