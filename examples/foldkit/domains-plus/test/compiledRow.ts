/**
 * #473's spike: the result row (`drawRow` in `src/client/view.ts`) as a
 * compiler could emit it for a server render. The markup Foldkit's
 * serializer writes for the row is fixed strings with a hole for each value
 * the row reads: its name, its price and terms, whether it is taken, whether
 * the cart holds it, and the binding its cart form is given.
 *
 * Written by hand from the view, standing in for a compiler. What a compiler
 * would read from the Slots and icons at build (class names, the two icons'
 * markup) is read here from one page the interpreted path rendered
 * (`staticsFrom`); other pages' rows are the test (`compiledRow.test.ts`).
 */
import { WindowList } from 'foldkit-mixins-ui'
import { Message } from '../src/client/app.js'
import {
  DomainListing,
  domainToReadyListing,
  formatRegistrationPrice,
  formatRenewalPrice,
} from '../src/client/domain'
import { arrangedOf } from '../src/client/results.js'
import { initResultsList } from '../src/client/resultsList.js'
import { makeDemoDomain } from '../src/shared/demoDomains'
import { Domain } from '../src/shared/domain'

/** What a row is drawn from: a name's listing and whether the cart holds it. */
interface Shown {
  readonly listing: DomainListing
  readonly added: boolean
}

/**
 * Foldkit's key marker (`hydrationMarkers.js`), which is not exported: a
 * keyed element carries this fingerprint of its key so hydration adopts it
 * by key. A compiled view needs it to stamp the same keys.
 */
const fingerprint = (value: string): string => {
  let lowLane = 2166136261
  let highLane = 1099511628
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index)
    const lowByte = codeUnit & 0xff
    const highByte = codeUnit >>> 8
    lowLane = Math.imul(lowLane ^ lowByte, 16777619)
    lowLane = Math.imul(lowLane ^ highByte, 16777619)
    highLane = Math.imul(highLane ^ highByte, 16777619)
    highLane = Math.imul(highLane ^ lowByte, 16777619)
  }
  return (
    (lowLane >>> 0).toString(16).padStart(8, '0') + (highLane >>> 0).toString(16).padStart(8, '0')
  )
}

// Foldkit's serializer escapes (`serialize.js`), also internal. Its checks for
// NUL and lone surrogates are left out: a name is a domain label.
const TEXT: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '\r': '&#13;',
}
const ATTRIBUTE: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '"': '&quot;',
  '<': '&lt;',
  '\r': '&#13;',
}
const escapeText = (value: string) => value.replace(/[&<>\r]/g, character => TEXT[character]!)
const escapeAttribute = (value: string) =>
  value.replace(/[&"<\r]/g, character => ATTRIBUTE[character]!)

/** What a compiler would write into the template at build. */
export interface RowStatics {
  readonly row: string
  readonly domainName: string
  readonly rowAction: string
  readonly pendingAction: string
  readonly price: string
  readonly unavailable: string
  readonly cartForm: string
  readonly iconButton: string
  readonly skeletonPrice: string
  readonly skeletonAction: string
  readonly cartIcon: string
  readonly checkIcon: string
}

/** A page's result rows, in order: the window's, then the pending stand-ins'. */
export const rowsIn = (page: string): ReadonlyArray<string> =>
  [...page.matchAll(/<li\b[^>]*class="domain-row [\s\S]*?<\/li>/g)].map(([row]) => row)

const first = (html: string, pattern: RegExp, what: string): string => {
  const found = pattern.exec(html)?.[1]
  if (found === undefined) throw new Error(`compiledRow: the page has no ${what}`)
  return found
}

/**
 * The statics, from the rows of a page that draws every row state: a taken
 * name, a name in the cart, one not in it, and a pending row. The Top
 * Results cards share some classes and not others, so only rows are read.
 */
export const staticsFrom = (page: string): RowStatics => {
  const html = rowsIn(page).join('')
  return {
    row: first(html, /<li [^>]*class="(domain-row [^"]*)"/, 'row'),
    domainName: first(html, /class="(domain-name [^"]*)"/, 'name'),
    rowAction: first(html, /<div class="(domain-action [^"]*)"/, 'row action'),
    pendingAction: first(
      html,
      /<div aria-hidden="true" class="(domain-action [^"]*)"/,
      'pending row action',
    ),
    price: first(html, /class="(price [^"]*)"/, 'price'),
    unavailable: first(html, /class="(unavailable [^"]*)"/, 'taken name'),
    cartForm: first(html, /<form data-foldkit-plus-on-submit="\d+" class="([^"]*)"/, 'cart form'),
    iconButton: first(html, /class="(icon-button [^"]*)"/, 'icon button'),
    skeletonPrice: first(html, /class="(skeleton skeleton-price [^"]*)"/, 'pending price'),
    skeletonAction: first(html, /class="(skeleton skeleton-action [^"]*)"/, 'pending action'),
    cartIcon: first(html, /aria-label="Add [^>]*>(<svg[\s\S]*?<\/svg>)/, 'name not in the cart'),
    checkIcon: first(html, /aria-label="Remove [^>]*>(<svg[\s\S]*?<\/svg>)/, 'name in the cart'),
  }
}

/**
 * The rows, in order, as one string: what the interpreted path builds as
 * vnodes and serializes. Each cart form takes the next binding: its id is
 * the binding's place in `bindings`, which the resume envelope carries, so a
 * compiled region must be filled in the render's binding order.
 */
export const compileRows = (statics: RowStatics) => {
  const pending =
    `<div aria-hidden="true" class="${statics.pendingAction}">` +
    `<span class="${statics.skeletonPrice}"></span><span class="${statics.skeletonAction}"></span></div>`
  const takenAction =
    `<div class="${statics.rowAction}"><span class="${statics.unavailable}" ` +
    'title="This sample domain is marked unavailable in the demo data.">Not available</span></div>'

  const available = (
    domain: typeof Domain.Available.Type,
    added: boolean,
    bindings: Array<Message>,
  ): string => {
    const name = escapeAttribute(domain.name)
    const registration = formatRegistrationPrice(domain)
    const premium = domain.isPremium ? 'Premium domain. ' : ''
    const renewal = formatRenewalPrice(domain)
    const message = added
      ? Message.ClickedRemoveDomain({ name: domain.name })
      : Message.ClickedAddDomain({ name: domain.name })
    const binding = bindings.push(message) - 1
    return (
      `<div class="${statics.rowAction}"><span class="${statics.price}" title="${escapeAttribute(premium + renewal)}">` +
      `${escapeText(registration)}</span>` +
      `<form data-foldkit-plus-on-submit="${binding}" class="${statics.cartForm}" method="post">` +
      `<button${added ? ' data-added=""' : ''} aria-label="${added ? `Remove ${name} from` : `Add ${name} to`} cart" ` +
      `aria-description="${escapeAttribute(`${registration}. ${premium}${renewal}`)}" class="${statics.iconButton}" type="submit">` +
      `${added ? statics.checkIcon : statics.cartIcon}</button>` +
      `<input type="hidden" name="foldkit-plus-message" value="${escapeAttribute(
        `{"_tag":"${message._tag}","name":${JSON.stringify(domain.name)}}`,
      )}"></form></div>`
    )
  }

  const row = ({ listing, added }: Shown, bindings: Array<Message>): string => {
    const { mark, action } = DomainListing.match(listing, {
      Pending: () => ({ mark: '', action: pending }),
      Ready: ({ domain }) =>
        Domain.match(domain, {
          Unconfirmed: () => ({ mark: ' data-unavailable=""', action: takenAction }),
          Available: domain => ({ mark: '', action: available(domain, added, bindings) }),
        }),
    })
    const label = listing.name.slice(0, -(listing.tld.length + 1))
    return (
      `<li${mark} class="${statics.row}" data-foldkit-key="${fingerprint(`s:${listing.name}`)}">` +
      `<span class="${statics.domainName}"><span data-domain-label="">${escapeText(label)}</span>` +
      `${escapeText(`.${listing.tld}`)}</span>${action}</li>`
    )
  }

  return (rows: ReadonlyArray<Shown>, bindings: Array<Message>): string => {
    let html = ''
    for (const shown of rows) html += row(shown, bindings)
    return html
  }
}

/** The pending stand-ins drawn below the window (`PREVIEW_RESULT_COUNT` in `view.ts`). */
const PREVIEW_ROWS = 36

/**
 * The rows a search page draws for `label` opened at group `from`, from the
 * app's own arrangement and the demo's prices: the window's groups priced,
 * then the first names pending. Default filters only.
 */
export const firstScreen = (
  label: string,
  from: number,
  cart: ReadonlyArray<string>,
): { readonly window: ReadonlyArray<Shown>; readonly preview: ReadonlyArray<Shown> } => {
  const arranged = arrangedOf(
    label,
    { tldFilter: 'All', availabilityFilter: 'All', sortOrder: 'Relevance' },
    [],
  )
  const { start, end } = WindowList.pageOf(initResultsList(from), arranged.keys)
  const names = arranged.groups.flatMap(group => group.listings)
  return {
    window: arranged.groups
      .slice(start, end)
      .flatMap(group => group.listings)
      .map(({ name, tld }) => ({
        listing: domainToReadyListing(makeDemoDomain(label, tld)),
        added: cart.includes(name),
      })),
    preview: names
      .slice(0, PREVIEW_ROWS)
      .map(({ name, tld }) => ({ listing: DomainListing.Pending({ name, tld }), added: false })),
  }
}
