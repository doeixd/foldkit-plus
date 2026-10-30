/**
 * The page, drawn through the Slots of `style.ts`. Its structure, ids,
 * roles and labels are upstream's (`examples/foldkit/domains/src/client/view.ts`),
 * so a reader, a screen reader and upstream's Playwright suites meet the
 * same page.
 */
import { Array, Option, String, pipe } from 'effect'
import type { Document, Html, HtmlBuilder } from 'foldkit/html'
import { Icon, type IconData } from 'foldkit-media'
import { SlotView, Style, type SlotBuilders } from 'foldkit-mixins'
import { queryToMaybeDomainLabel, type DomainName } from '../shared/domain'
import { Message, type Model } from './app.js'
import { SEARCH_INPUT_ID } from './command.js'
import { TOP_RESULT_COUNT, queryToPendingDomainListings, type DomainListing } from './domain'
import { icons } from './iconData.js'
import { AppRoute, canonicalOf, searchHref, titleOf } from './site.js'
import { Page } from './style.js'

type H = HtmlBuilder<Message>
type Slots = SlotBuilders<typeof Page.slots, Message>

/** How many pending rows stand in for All Results before its first answer, as upstream. */
const PREVIEW_RESULT_COUNT = 36

const INVALID_LABEL =
  'Enter a domain name using letters, numbers, and hyphens (up to 63 characters).'

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

const header = (slots: Slots, h: H): Html =>
  h.header(slots.header.attrs(), [
    h.a(slots.brand.attrs([h.Href(searchHref), h.AriaLabel('Domains home')]), [
      logo(slots, h),
      h.span(slots.brandDivider.attrs(), ['/']),
      h.span([], ['Domains']),
    ]),
    h.span(slots.demoLabel.attrs(), ['Unofficial demo']),
    h.div(slots.headerActions.attrs(), []),
  ])

const searchForm = (model: Model, slots: Slots, h: H): Html =>
  h.form(slots.search.attrs([h.Role('search'), h.OnSubmit(Message.SubmittedSearch())]), [
    h.span(slots.searchIcon.attrs(), [icon(icons.search, h, '16px')]),
    h.input(
      slots.searchInput.attrs([
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
        h.OnInput(value => Message.UpdatedSearch({ value })),
        h.OnKeyDownPreventDefault(key =>
          key === 'Escape' ? Option.some(Message.PressedEscape()) : Option.none(),
        ),
      ]),
    ),
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

const card = (listing: DomainListing, slots: Slots, h: H): Html =>
  h.keyed('article')(listing.name, slots.card.attrs(), [
    h.h3(slots.cardName.attrs(), domainName(listing, h)),
    pendingAction(slots.action, slots, h),
  ])

const row = (listing: DomainListing, slots: Slots, h: H): Html =>
  h.keyed('li')(listing.name, slots.row.attrs(), [
    h.span(slots.domainName.attrs(), domainName(listing, h)),
    pendingAction(slots.rowAction, slots, h),
  ])

const searchError = (error: string, slots: Slots, h: H): Html =>
  h.div(slots.searchError.attrs([h.Role('alert')]), [
    h.h2(slots.searchErrorTitle.attrs(), ['Let’s try that again']),
    h.p(slots.searchErrorText.attrs([h.Id('search-error')]), [error]),
  ])

const searchResults = (model: Model, slots: Slots, h: H): Html => {
  const listings = queryToPendingDomainListings(model.query)
  return h.div(
    [],
    [
      h.div(slots.resultsContent.attrs([h.AriaBusy(true)]), [
        h.div(slots.topHeading.attrs(), [
          h.h2(slots.sectionTitle.attrs(), ['Top Results']),
          h.span(slots.sampleLabel.attrs(), ['Sample data']),
        ]),
        h.div(
          slots.topResults.attrs(),
          Array.map(Array.take(listings, TOP_RESULT_COUNT), listing => card(listing, slots, h)),
        ),
        h.div(slots.resultsHeading.attrs(), [h.h2(slots.sectionTitle.attrs(), ['All Results'])]),
        h.div(slots.allResults.attrs(), [
          h.ul(
            slots.preview.attrs([h.AriaHidden(true)]),
            Array.map(Array.take(listings, PREVIEW_RESULT_COUNT), listing =>
              row(listing, slots, h),
            ),
          ),
        ]),
      ]),
      h.p(
        slots.resultCount.attrs([
          h.Role('status'),
          h.AriaAtomic(true),
          h.AriaLabel('Searching domains'),
        ]),
        ['Checking availability and prices…'],
      ),
    ],
  )
}

const results = (model: Model, slots: Slots, h: H): Html =>
  h.section(slots.results.attrs([h.AriaLabel('Domain results')]), [
    isInvalid(model.query) ? searchError(INVALID_LABEL, slots, h) : searchResults(model, slots, h),
  ])

const footer = (slots: Slots, h: H): Html =>
  h.footer(slots.footer.attrs(), [
    h.span([], ['A Foldkit demo · Not affiliated with Vercel']),
    h.span([], ['Sample data · Demo cart']),
    h.a(slots.footerLink.attrs([h.Href('https://github.com/foldkit/foldkit-domains')]), [
      'View source',
      icon(icons.arrowUpRight, h, '12px'),
    ]),
  ])

const searchPage = (model: Model, slots: Slots, h: H): Html =>
  h.div(
    slots.app.attrs([
      h.Id('domains-app'),
      h.DataAttribute('search-layout', model.searchLayout),
      h.DataAttribute('search', String.isNonEmpty(model.query) ? 'active' : 'idle'),
    ]),
    [
      h.a(slots.skip.attrs([h.Href('#main')]), ['Skip to main content']),
      header(slots, h),
      h.main(slots.main.attrs([h.Id('main'), h.Tabindex(-1)]), [
        h.h1(slots.pageHeading.attrs(), ['Domain search']),
        hero(model, slots, h),
        beginSearch(slots, h),
        results(model, slots, h),
      ]),
      footer(slots, h),
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
