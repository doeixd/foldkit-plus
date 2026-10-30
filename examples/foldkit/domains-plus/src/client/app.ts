/**
 * The application: one Model, one Message union (`message.ts`), one
 * `update`. The search text is the Model's `query`, which `foldkit-mirror`
 * keeps in `?q=`; the label the reads use is `settledLabel`, which the
 * debounce moves once the text rests.
 */
import { Option, Schema, String } from 'effect'
import { UrlRequest } from 'foldkit/navigation'
import { modifyFields } from 'foldkit/struct'
import type * as Update from 'foldkit/update'
import { Url, toString as urlToString } from 'foldkit/url'
import { Bundle } from 'foldkit-bundle'
import { Mirror } from 'foldkit-mirror'
import { SSR } from 'foldkit-ssr/client'
import { Projection, Surface } from 'foldkit-surface'
import { DomainLabel, queryToMaybeDomainLabel } from '../shared/domain'
import {
  DismissSearchKeyboard,
  FocusSearchInput,
  LoadExternal,
  NavigateInternal,
} from './command.js'
import { Message, Search, SearchInput } from './message.js'
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
})
export type Model = typeof Model.Type

type Return = Update.Return<Model, Message>

/** A keystroke for the debounce, which settles it 150 ms after the last one. */
const typed = (model: Model, value: string): Return =>
  update(model, Message.GotSearchMessage({ message: SearchInput.Message.Changed({ value }) }))

const layoutFor = (model: Model, query: string): SearchLayout =>
  String.isNonEmpty(query) ? 'Search' : model.searchLayout

/** The search box emptied: nothing is read, now, not after the debounce. */
const cleared = (model: Model): Return =>
  typed(modifyFields(model, { query: () => '', settledLabel: () => Option.none() }), '')

const own = (model: Model, message: Message): Return =>
  Message.match(message, {
    // The placement below answers the debounce's own Messages.
    GotSearchMessage: () => ({ model }),
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
    CompletedNavigateInternal: () => ({ model }),
    CompletedLoadExternal: () => ({ model }),
    CompletedFocusSearchInput: () => ({ model }),
    CompletedDismissSearchKeyboard: () => ({ model }),
  })

/** How long the search text rests before it is read. */
const SETTLE_MS = 150

/**
 * The empty search page, built before the assembly below: the mirror reads
 * its defaults from it, and the debounce's slice is its own `init`'s.
 */
const empty: Model = {
  search: SearchInput.init({ delayMs: SETTLE_MS }).model,
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
  initial: empty,
})

const Page = Bundle.parent({ Model, Message })

const Settled = Page.at(Search, {
  args: { delayMs: SETTLE_MS },
  // The debounce drops the timer of a text typed over, so what rests is the box's.
  onOut:
    ({ value }) =>
    (model: Model): Return => ({
      model: modifyFields(model, { settledLabel: () => queryToMaybeDomainLabel(value) }),
    }),
})

const placements = Page.assemble(QueryInUrl.wiring('ChangedUrl'), Settled)

export const update = placements.update(own)

/** The page at `route` with `query` in its box, read at once: the server's first render. */
const start = (route: AppRoute, query: string): Return =>
  placements.initial({
    route,
    query,
    settledLabel: queryToMaybeDomainLabel(query),
    searchLayout: String.isNonEmpty(query) ? 'Search' : 'Landing',
  })

/** The page at `url`, as the server renders it; the browser resumes from it. */
export const init = (url: Url): Return => start(routeOf(url), QueryInUrl.reduce(empty, url).query)

export const subscriptions = placements.subscriptions()

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
    local: [App.model.search],
  },
)

/** Foldkit's link and address handlers. */
export const routing = {
  onUrlRequest: (request: UrlRequest) => Message.ClickedLink({ request }),
  onUrlChange: (url: Url) => Message.ChangedUrl({ url }),
}
