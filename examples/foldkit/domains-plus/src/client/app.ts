/**
 * The application: one Model, one Message union (`message.ts`), one
 * `update`. The search text is the Model's `query`, which `foldkit-mirror`
 * keeps in `?q=`; the label the reads use is `settledLabel`, which the
 * debounce moves once the text rests.
 */
import { Array, Option, Schema, String } from 'effect'
import { UrlRequest } from 'foldkit/navigation'
import { modifyFields } from 'foldkit/struct'
import type * as Update from 'foldkit/update'
import { Url, toString as urlToString } from 'foldkit/url'
import { Bundle } from 'foldkit-bundle'
import { Mirror } from 'foldkit-mirror'
import { Remote, RemotePolicy, type RemoteClient } from 'foldkit-remote'
import { SSR } from 'foldkit-ssr/client'
import { Projection, Surface } from 'foldkit-surface'
import { DomainLabel, domainCandidates, queryToMaybeDomainLabel } from '../shared/domain'
import { Domain, Quote } from '../shared/entity'
import {
  DismissSearchKeyboard,
  FocusSearchInput,
  LoadExternal,
  NavigateInternal,
} from './command.js'
import { TOP_RESULT_COUNT } from './domain'
import { Message, Own, Search, SearchInput } from './message.js'
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
})
export type Model = typeof Model.Type

type Return = Update.Return<Model, Message, RemoteClient>

/** A keystroke for the debounce, which settles it 150 ms after the last one. */
const typed = (model: Model, value: string): Return =>
  update(model, Message.GotSearchMessage({ message: SearchInput.Message.Changed({ value }) }))

const layoutFor = (model: Model, query: string): SearchLayout =>
  String.isNonEmpty(query) ? 'Search' : model.searchLayout

/** The search box emptied: nothing is read, now, not after the debounce. */
const cleared = (model: Model): Return =>
  typed(modifyFields(model, { query: () => '', settledLabel: () => Option.none() }), '')

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
  remote: Remote.initial,
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

/** The prices, a server's facts read by name and kept in the Model. */
export const Data = Remote.make({
  model: App.model.remote,
  entities: [Domain],
  // Nothing here writes, so nothing is predicted; `Trace.run` refuses a domain without it (#368).
  verifyPredictions: import.meta.env.DEV === true,
})

/** The names a label is offered under, in upstream's order. */
export const namesOf = (label: string): ReadonlyArray<string> =>
  Array.map(domainCandidates(label), ({ name }) => name)

/** A read of each of `names`, keyed by the name. */
const readsOf = (names: ReadonlyArray<string>) =>
  Object.fromEntries(Array.map(names, name => [name, Data.get(Quote, name)]))

/** The four Top Results: read first, as upstream's first request. */
export const TopResults = App.surface('TopResults', {
  params: { label: Schema.String },
  model: ({ params }) => readsOf(Array.take(namesOf(params.label), TOP_RESULT_COUNT)),
})

/** The names the page reads now: the Top Results of the settled label. */
export const readNames = (model: Model): ReadonlyArray<string> =>
  Option.match(model.settledLabel, {
    onNone: () => [],
    onSome: label => Array.take(namesOf(label), TOP_RESULT_COUNT),
  })

/** Every read the page makes, each while the settled label is a name. */
export const actives = {
  top: Surface.at(TopResults, (model: Model) =>
    Option.map(model.settledLabel, label => ({ label })),
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
    (model: Model): Return => ({
      model: modifyFields(model, { settledLabel: () => queryToMaybeDomainLabel(value) }),
    }),
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
    // Prices are read again in the browser, as upstream's are: none is inlined.
    local: [App.model.search, App.model.remote],
  },
)

/** Foldkit's link and address handlers. */
export const routing = {
  onUrlRequest: (request: UrlRequest) => Message.ClickedLink({ request }),
  onUrlChange: (url: Url) => Message.ChangedUrl({ url }),
}
