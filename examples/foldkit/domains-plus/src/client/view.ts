/**
 * The page, drawn through the Slots of `style.ts`. Its structure, ids,
 * roles and labels are upstream's (`examples/foldkit/domains/src/client/view.ts`),
 * so a reader, a screen reader and upstream's Playwright suites meet the
 * same page.
 */
import { Array, Option, String, pipe } from 'effect'
import type { Document, Html, HtmlBuilder } from 'foldkit/html'
import { Icon, type IconData } from 'foldkit-media'
import { Behavior, SlotView, Style, type SlotBuilders } from 'foldkit-mixins'
import { WindowList, WindowListSlots } from 'foldkit-mixins-ui'
import { Resume } from 'foldkit-ssr/client'
import { Projection } from 'foldkit-surface'
import {
  type AvailableDomain,
  Domain,
  domainTlds,
  queryToMaybeDomainLabel,
  type DomainName,
} from '../shared/domain'
import { App, Message, type Model } from './app.js'
import { SEARCH_INPUT_ID } from './command.js'
import {
  DomainListing,
  TOP_RESULT_COUNT,
  domainToReadyListing,
  formatRegistrationPrice,
  formatRenewalPrice,
  queryToDomainListings,
} from './domain'
import { icons } from './iconData.js'
import { AppRoute, canonicalOf, searchHref, titleOf } from './site.js'
import {
  DomainRequest,
  INVALID_LABEL,
  SearchViewState,
  searchViewState,
} from './searchViewState.js'
import { type CartInput, cartAnnouncement, cartButton, cartSheet } from './cart.js'
import { filters } from './filters.js'
import { type Arranged, arrangedOf } from './results.js'
import type { DomainListingGroup } from './resultsList.js'
import { Page, ResultsListStyle } from './style.js'

type H = HtmlBuilder<Message>
type Slots = SlotBuilders<typeof Page.slots, Message>

/** How many pending rows stand in for All Results before its first answer, as upstream. */
const PREVIEW_RESULT_COUNT = 36

/** Whether the query names no domain: something typed that is no label. */
const isInvalid = (query: string): boolean =>
  String.isNonEmpty(query) && Option.isNone(queryToMaybeDomainLabel(query))

const icon = (data: IconData, h: H, size = '18px'): Html => Icon.draw(data, h, { size })

const logo = (slots: Slots, h: H): Html =>
  h.svg(
    slots.logo.attrs([
      h.Width('20'),
      h.Height('20'),
      h.ViewBox('0 0 200 200'),
      h.Fill('currentColor'),
      h.AriaHidden(true),
    ]),
    [
      h.rect([h.Width('92.3077'), h.Height('200')]),
      h.rect([h.X('107.692'), h.Width('92.3077'), h.Height('38.4615')]),
      h.rect([h.X('107.692'), h.Y('53.8461'), h.Width('92.3077'), h.Height('38.4615')]),
    ],
  )

const header = (model: CartInput, slots: Slots, h: H): Html =>
  h.header(slots.header.attrs(), [
    h.a(
      slots.brand.attrs([
        h.Href(searchHref),
        h.AriaLabel('Domains home'),
        // Focused during the press, where a phone still lets a field take the keyboard.
        h.OnClick(Message.ClickedDomainsHome(), { focusSelector: `#${SEARCH_INPUT_ID}` }),
      ]),
      [logo(slots, h), h.span(slots.brandDivider.attrs(), ['/']), h.span([], ['Domains'])],
    ),
    h.span(slots.demoLabel.attrs(), ['Unofficial demo']),
    h.div(slots.headerActions.attrs(), [cartButton(model, slots, h)]),
    cartAnnouncement(model, slots, h),
  ])

const searchForm = (model: Model, slots: Slots, h: H): Html => {
  const rh = Resume.builder(h)
  return h.form(slots.search.attrs([h.Role('search'), h.OnSubmit(Message.SubmittedSearch())]), [
    h.span(slots.searchIcon.attrs(), [icon(icons.search, h, '16px')]),
    rh.input([
      ...slots.searchInput.attrs([
        h.Id(SEARCH_INPUT_ID),
        h.Type('search'),
        h.Name('q'),
        h.AriaLabel('Search domains'),
        h.AriaInvalid(isInvalid(model.query)),
        ...(isInvalid(model.query) ? [h.AriaDescribedBy('search-error')] : []),
        h.Placeholder('Search for a domain'),
        h.Value(model.query),
        h.Autocomplete('off'),
        h.Attribute('autocapitalize', 'none'),
        h.Attribute('enterkeyhint', 'search'),
        h.Spellcheck(false),
        h.OnKeyDownPreventDefault(key =>
          key === 'Escape' ? Option.some(Message.PressedEscape()) : Option.none(),
        ),
      ]),
      // Named, so the server's page says which Message typing sends, and kept:
      // what is typed before the bundle runs is replayed as that Message. The
      // element is `rh`'s, which is how the server marks it.
      rh.OnInput(Message.UpdatedSearch),
      rh.KeepTyped(),
    ]),
    h.button(
      slots.clearSearch.attrs([
        h.Type('button'),
        h.AriaLabel('Clear search, Esc'),
        h.AriaKeyshortcuts('Escape'),
        h.OnClick(Message.ClickedClearSearch()),
      ]),
      [
        h.kbd(slots.kbd.attrs([h.AriaHidden(true)]), ['Esc']),
        h.span(slots.clearIcon.attrs(), [icon(icons.close, h)]),
      ],
    ),
  ])
}

const hero = (model: Model, slots: Slots, h: H): Html =>
  h.section(slots.hero.attrs([h.AriaLabel('Find your domain')]), [
    h.h1(slots.heroTitle.attrs(), [
      'Find a domain for',
      h.br([]),
      h.span(slots.heroAccent.attrs(), ['the next viral idea.']),
    ]),
    h.p(slots.heroLine.attrs(), [
      'Sample data. ',
      h.a(slots.heroLink.attrs([h.Href('https://vercel.com/domains/pricing')]), ['Vercel pricing']),
    ]),
    searchForm(model, slots, h),
    h.div(slots.heroSpace.attrs(), []),
  ])

const beginSearch = (slots: Slots, h: H): Html =>
  h.section(slots.beginSearch.attrs([h.AriaLabel('Begin your search')]), [
    h.div(slots.beginCopy.attrs(), [
      h.div(slots.beginIcon.attrs(), [icon(icons.search, h, '20px')]),
      h.h2(slots.beginTitle.attrs(), ['Begin your search']),
      h.p(slots.beginText.attrs(), [
        'Enter a domain name to explore sample prices and availability.',
      ]),
    ]),
  ])

/** A name with its label apart from its extension, as upstream draws it. */
const domainName = (domain: DomainName, h: H): ReadonlyArray<Html | string> => [
  h.span(
    [h.DataAttribute('domain-label', '')],
    [pipe(domain.name, String.slice(0, -(String.length(domain.tld) + 1)))],
  ),
  `.${domain.tld}`,
]

/** A price and a button not yet known: two skeletons, hidden from a screen reader. */
const pendingAction = (slot: Slots['action'], slots: Slots, h: H): Html =>
  h.div(slot.attrs([h.AriaHidden(true)]), [
    h.span(slots.skeletonPrice.attrs(), []),
    h.span(slots.skeletonAction.attrs(), []),
  ])

/** An answered name: its price and terms, or that the demo marks it taken. */
const readyAction = (
  added: boolean,
  domain: Domain,
  slot: Slots['action'],
  slots: Slots,
  h: H,
): Html =>
  Domain.match(domain, {
    Unconfirmed: () =>
      h.div(slot.attrs(), [
        h.span(
          slots.unavailable.attrs([
            h.Title('This sample domain is marked unavailable in the demo data.'),
          ]),
          ['Not available'],
        ),
      ]),
    Available: available =>
      h.div(slot.attrs(), [
        h.span(
          slots.price.attrs([
            h.Title(
              `${available.isPremium ? 'Premium domain. ' : ''}${formatRenewalPrice(available)}`,
            ),
          ]),
          [formatRegistrationPrice(available)],
        ),
        cartToggle(added, available, slots, h),
      ]),
  })

/** Adds an available name to the cart, or takes it out again. */
const cartToggle = (added: boolean, domain: AvailableDomain, slots: Slots, h: H): Html => {
  const terms = `${formatRegistrationPrice(domain)}. ${domain.isPremium ? 'Premium domain. ' : ''}${formatRenewalPrice(domain)}`
  return h.button(
    slots.iconButton.attrs([
      h.Type('button'),
      ...(added ? [h.DataAttribute('added', '')] : []),
      h.AriaLabel(added ? `Remove ${domain.name} from cart` : `Add ${domain.name} to cart`),
      h.AriaDescription(terms),
      h.OnClick(
        added
          ? Message.ClickedRemoveDomain({ name: domain.name })
          : Message.ClickedAddDomain({ domain }),
      ),
    ]),
    [Icon.draw(added ? icons.check : icons.cart, h, { size: '18px' })],
  )
}

const action = (
  added: boolean,
  listing: DomainListing,
  slot: Slots['action'],
  slots: Slots,
  h: H,
): Html =>
  DomainListing.match(listing, {
    Pending: () => pendingAction(slot, slots, h),
    Ready: ({ domain }) => readyAction(added, domain, slot, slots, h),
  })

/** Whether the demo marks an answered name taken, which greys its name. */
const isUnavailable = DomainListing.match({
  Pending: () => false,
  Ready: ({ domain }) => Domain.guards.Unconfirmed(domain),
})

const unavailableMark = (listing: DomainListing, h: H) =>
  isUnavailable(listing) ? [h.DataAttribute('unavailable', '')] : []

/**
 * What a card or a row is drawn from, each kept while it holds the same: a
 * name's listing (`listingOf`) and whether the cart holds it. A card and a
 * row are each drawn again only when one of these changed.
 */
interface Shown {
  readonly listing: DomainListing
  readonly added: boolean
}

const drawCard = (slots: Slots, h: H, { listing, added }: Shown): Html =>
  h.keyed('article')(listing.name, slots.card.attrs(unavailableMark(listing, h)), [
    h.h3(slots.cardName.attrs(), domainName(listing, h)),
    action(added, listing, slots.action, slots, h),
  ])

const drawRow = (slots: Slots, h: H, { listing, added }: Shown): Html =>
  h.keyed('li')(listing.name, slots.row.attrs(unavailableMark(listing, h)), [
    h.span(slots.domainName.attrs(), domainName(listing, h)),
    action(added, listing, slots.rowAction, slots, h),
  ])

// The stand-ins drawn before All Results' first answer: a name, its price unknown.
const drawPreviewRow = (
  slots: Slots,
  h: H,
  { name, tld }: { readonly name: string; readonly tld: string },
): Html => drawRow(slots, h, { listing: DomainListing.Pending({ name, tld }), added: false })

// One Ready listing per answered domain, so a row reads the same listing
// while its domain is the same value.
const readyListings = new WeakMap<Domain, DomainListing>()
const readyListingOf = (domain: Domain): DomainListing => {
  const known = readyListings.get(domain)
  if (known !== undefined) return known
  const made = domainToReadyListing(domain)
  readyListings.set(domain, made)
  return made
}

/** Whether the cart holds a name: a set of the cart's names, made once per cart. */
const cartNames = new WeakMap<Model['cart'], ReadonlySet<string>>()
const isAdded = (cart: Model['cart'], name: string): boolean => {
  const known = cartNames.get(cart)
  if (known !== undefined) return known.has(name)
  const made = new Set(Array.map(cart, domain => domain.name))
  cartNames.set(cart, made)
  return made.has(name)
}

/** A listing as `readyListingOf` keeps it, once it is answered. */
const stableListing = DomainListing.match({
  Pending: (listing): DomainListing => listing,
  Ready: ({ domain }) => readyListingOf(domain),
})

const card = (model: Model, listing: DomainListing, slots: Slots): Html =>
  slots.card.lazy({ index: 0, id: listing.name }, drawCard, {
    listing,
    added: isAdded(model.cart, listing.name),
  })

const row = (model: Model, listing: DomainListing, slots: Slots): Html =>
  slots.row.lazy({ index: 0, id: listing.name }, drawRow, {
    listing,
    added: isAdded(model.cart, listing.name),
  })

const retryButton = (slots: Slots, h: H): Html =>
  h.button(slots.button.attrs([h.Type('button'), h.OnClick(Message.ClickedRetrySearch())]), [
    'Try again',
  ])

const searchError = (error: string, retry: boolean, slots: Slots, h: H): Html =>
  h.div(slots.searchError.attrs([h.Role('alert')]), [
    h.h2(slots.searchErrorTitle.attrs(), ['Let’s try that again']),
    h.p(slots.searchErrorText.attrs([h.Id('search-error')]), [error]),
    ...(retry ? [retryButton(slots, h)] : []),
  ])

const groupKey = (group: DomainListingGroup): string => group.id

/**
 * Every name of the typed label as the filters and sort arrange them, in rows
 * of six, drawn by `WindowList` while in view of the window. A row draws its
 * names from what has been read.
 */
const allResults = (
  model: Model,
  arranged: Arranged,
  domains: ReadonlyArray<Domain>,
  slots: Slots,
  h: H,
): Html => {
  const byName = new Map(Array.map(domains, domain => [domain.name, domain] as const))
  const listingOf = (listing: DomainListing): DomainListing =>
    Option.match(Option.fromNullishOr(byName.get(listing.name)), {
      onNone: () => listing,
      onSome: readyListingOf,
    })
  return WindowList.view(
    {
      model: model.resultsList,
      items: arranged.groups,
      itemToKey: groupKey,
      itemToView: (group, index) =>
        h.ul(
          slots.rowGroup.attrs([
            h.DataAttribute('virtual-list-item-key', group.id),
            h.DataAttribute('virtual-list-item-index', `${index}`),
          ]),
          Array.map(group.listings, listing => row(model, listingOf(listing), slots)),
        ),
      onMessage: message => Message.GotResultsListMessage({ message }),
      label: 'All domain results',
      style: ResultsListStyle,
      // A tab stop that says how it moves: the page scrolls, so the browser's
      // arrows, Page Up and Down, Home and End move it, as upstream's keys do.
      mixins: [
        Behavior.forSlots(WindowListSlots)<undefined, Message>({
          root: Behavior.slot({
            attributes: ({ h }) => [
              h.Tabindex(0),
              h.OnFocus(Message.FocusedResultsList()),
              h.AriaDescription(
                `${arranged.count} domains. Use arrow keys, Page Up, Page Down, Home, and End to scroll the page.`,
              ),
            ],
          }),
        }).mixin,
      ],
    },
    h,
  )
}

/** What the count line says: how many names are checked, until all are. */
const resultCountText = (search: SearchViewState, count: number) =>
  SearchViewState.match(search, {
    Idle: () => 'Checking availability and prices…',
    Loading: () => 'Checking availability and prices…',
    Failed: () => 'Checking availability and prices…',
    Ready: ({ domains }) =>
      domains.length < domainTlds.length
        ? `${domains.length} of ${domainTlds.length} domains checked · Registration prices in USD`
        : `${count} domains · Registration prices in USD`,
  })

const noArrangement: Arranged = { groups: [], keys: [], count: 0 }

const searchResults = (model: Model, search: SearchViewState, slots: Slots, h: H): Html => {
  const domains = SearchViewState.match(search, {
    Idle: () => [],
    Loading: () => [],
    Failed: () => [],
    Ready: ready => ready.domains,
  })
  const listings = queryToDomainListings(model.query, domains)
  const arranged = Option.match(queryToMaybeDomainLabel(model.query), {
    onNone: () => noArrangement,
    onSome: label => arrangedOf(label, model, domains),
  })
  const request = SearchViewState.match(search, {
    Idle: () => DomainRequest.Idle(),
    Loading: () => DomainRequest.Loading(),
    Failed: () => DomainRequest.Idle(),
    Ready: ready => ready.domainRequest,
  })
  const ready = SearchViewState.guards.Ready(search)
  return h.div(
    [],
    [
      h.div(slots.resultsContent.attrs([h.AriaBusy(DomainRequest.guards.Loading(request))]), [
        h.div(slots.topHeading.attrs(), [
          h.h2(slots.sectionTitle.attrs(), ['Top Results']),
          h.span(slots.sampleLabel.attrs(), ['Sample data']),
        ]),
        h.div(
          slots.topResults.attrs(),
          Array.map(Array.take(listings, TOP_RESULT_COUNT), listing =>
            card(model, stableListing(listing), slots),
          ),
        ),
        h.div(slots.resultsHeading.attrs(), [
          h.h2(slots.resultsTitle.attrs(), ['All Results']),
          Filters(model, slots, h),
        ]),
        arranged.count === 0
          ? h.p(slots.emptyResults.attrs([h.Role('status')]), [
              'No domains match your filters. Try another extension or show all domains.',
            ])
          : h.div(slots.allResults.attrs(), [
              allResults(model, arranged, domains, slots, h),
              h.ul(
                slots.preview.attrs([h.AriaHidden(true)]),
                Array.map(
                  Array.take(
                    arranged.groups.flatMap(group => group.listings),
                    PREVIEW_RESULT_COUNT,
                  ),
                  ({ name, tld }) =>
                    slots.row.lazy({ index: 0, id: name }, drawPreviewRow, { name, tld }),
                ),
              ),
            ]),
      ]),
      DomainRequest.match(request, {
        Idle: () => h.empty,
        Loading: () => h.empty,
        Failed: ({ error }) =>
          h.div(slots.banner.attrs([h.Role('alert')]), [
            h.p(slots.bannerText.attrs(), [error]),
            retryButton(slots, h),
          ]),
      }),
      h.p(
        slots.resultCount.attrs([
          h.Role('status'),
          h.AriaAtomic(true),
          ...(ready ? [] : [h.AriaLabel('Searching domains')]),
        ]),
        [resultCountText(search, arranged.count)],
      ),
    ],
  )
}

const results = (model: Model, slots: Slots, h: H): Html => {
  const search = searchViewState(model)
  return h.section(slots.results.attrs([h.AriaLabel('Domain results')]), [
    SearchViewState.match(search, {
      Idle: () => searchResults(model, search, slots, h),
      Loading: () => searchResults(model, search, slots, h),
      Ready: () => searchResults(model, search, slots, h),
      Failed: ({ error }) => searchError(error, error !== INVALID_LABEL, slots, h),
    }),
  ])
}

const footer = (slots: Slots, h: H): Html =>
  h.footer(slots.footer.attrs(), [
    h.span([], ['A Foldkit demo · Not affiliated with Vercel']),
    h.span([], ['Sample data · Demo cart']),
    h.a(slots.footerLink.attrs([h.Href('https://github.com/foldkit/foldkit-domains')]), [
      'View source',
      icon(icons.arrowUpRight, h, '12px'),
    ]),
  ])

// Drawn again only when what they read changed: a price arriving, a scroll or
// a keystroke leaves the header, the filters and the cart as they were.
const cartReads = Projection.struct({ cart: App.model.cart, cartSheet: App.model.cartSheet })
const Header = SlotView.region(cartReads, header)
const CartPanel = SlotView.region(cartReads, cartSheet)
const Filters = SlotView.region(
  Projection.struct({
    tldFilter: App.model.tldFilter,
    tldListbox: App.model.tldListbox,
    tldSheet: App.model.tldSheet,
    tldSearchQuery: App.model.tldSearchQuery,
    availabilityFilter: App.model.availabilityFilter,
    availabilityListbox: App.model.availabilityListbox,
    sortOrder: App.model.sortOrder,
    sortListbox: App.model.sortListbox,
    filtersSheet: App.model.filtersSheet,
  }),
  filters,
)

const searchPage = (model: Model, slots: Slots, h: H): Html =>
  h.div(
    slots.app.attrs([
      h.Id('domains-app'),
      h.DataAttribute('search-layout', model.searchLayout),
      h.DataAttribute('search', String.isNonEmpty(model.query) ? 'active' : 'idle'),
    ]),
    [
      h.a(
        slots.skip.attrs([
          h.Href('#main'),
          h.OnClick(Message.ClickedSkipToMain(), {
            defaultAction: 'Prevent',
            focusSelector: '#main',
          }),
        ]),
        ['Skip to main content'],
      ),
      Header(model, slots, h),
      h.main(slots.main.attrs([h.Id('main'), h.Tabindex(-1)]), [
        h.h1(slots.pageHeading.attrs(), ['Domain search']),
        hero(model, slots, h),
        beginSearch(slots, h),
        results(model, slots, h),
      ]),
      footer(slots, h),
      CartPanel(model, slots, h),
    ],
  )

const notFound = (path: string, slots: Slots, h: H): Html =>
  h.main(slots.notFound.attrs(), [
    h.h1(slots.notFoundTitle.attrs(), ['404 — Page Not Found']),
    h.p(slots.notFoundText.attrs(), [`The path "${path}" was not found.`]),
    h.a(slots.notFoundLink.attrs([h.Href(searchHref)]), ['← Back to Domains']),
  ])

const PageView = SlotView.forMessages<Message>()
  .define(Page.slots, (model: Model, slots, h) =>
    AppRoute.match(model.route, {
      Search: () => searchPage(model, slots, h),
      NotFound: ({ path }) => notFound(path, slots, h),
    }),
  )
  .pipe(Style.attach(Page.style))

export const view = (model: Model, h: H): Document => ({
  title: titleOf(model.route, model.query),
  canonical: canonicalOf(model.route),
  ogUrl: canonicalOf(model.route),
  body: PageView(model, h),
})
