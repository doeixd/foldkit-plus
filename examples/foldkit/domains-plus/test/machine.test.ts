import { Option } from 'effect'
import { UrlRequest } from 'foldkit/navigation'
import { fromString } from 'foldkit/url'
import { describe, expect, it } from 'vitest'
import { domainsMachine, init, Message, update, type Model } from '../src/client/app.js'

const startUrl = Option.getOrThrow(fromString('https://domains.test/'))

const seedModel = (): Model => {
  const base = init(startUrl).model
  return {
    ...base,
    cart: [
      {
        _tag: 'Available',
        name: 'acme.com',
        tld: 'com',
        price: 12,
        renewalPrice: 12,
        years: 1,
        isPremium: false,
      },
      {
        _tag: 'Available',
        name: 'acme.io',
        tld: 'io',
        price: 39,
        renewalPrice: 39,
        years: 1,
        isPremium: false,
      },
    ],
  }
}

describe('domains-plus declared transitions (Phase 3, Bouts 3.4 & 3.5)', () => {
  it('declares 31 of 39 own transitions with exact write footprints', () => {
    const tags = Object.keys(domainsMachine.transitions)
    expect(tags).toHaveLength(31)
    expect(domainsMachine.footprints.ClickedAddDomain.writes).toEqual([['cart']])
    expect(domainsMachine.footprints.UpdatedTldSearch.writes).toEqual([['tldSearchQuery']])
    expect(domainsMachine.footprints.ClickedRemoveDomain.writes).toEqual([['cart']])
    expect(domainsMachine.footprints.ClickedRemoveCartDomain.writes).toEqual([['cart']])
    expect(domainsMachine.footprints.SubmittedSearch.writes).toEqual([['settledLabel']])
    expect(domainsMachine.footprints.ClickedFilters.writes).toEqual([['filtersSheet']])
    expect(domainsMachine.footprints.ClickedMobileAvailabilityOption.writes).toEqual([
      ['availabilityFilter'],
      ['filtersSheet'],
    ])
    expect(domainsMachine.footprints.ClickedTldFilter.writes).toEqual([
      ['tldSearchQuery'],
      ['tldSheet'],
    ])
    expect(domainsMachine.footprints.GotResultsListMessage.writes).toEqual([
      ['resultsList'],
      ['from'],
    ])
    expect(domainsMachine.footprints.CompletedFocusCartButton.writes).toEqual([])
    expect(domainsMachine.footprints.FocusedResultsList.writes).toEqual([])
    expect(domainsMachine.footprints.ClickedLink.writes).toEqual([])
  })

  it('replays all 19 declared Messages and preserves Model identity on no-ops', () => {
    const internalUrl = Option.getOrThrow(fromString('https://domains.test/?q=acme'))
    const m0 = seedModel()

    // No-op Messages preserve Model identity (`toBe`).
    const noops: ReadonlyArray<Message> = [
      Message.CompletedFocusCartButton(),
      Message.CompletedFocusCartCloseButton(),
      Message.CompletedFocusFiltersButton(),
      Message.CompletedFocusTldFilterButton(),
      Message.CompletedRevealResultsListStart(),
      Message.CompletedScrollPage(),
      Message.CompletedNavigateInternal(),
      Message.CompletedLoadExternal(),
      Message.CompletedFocusSearchInput(),
      Message.CompletedDismissSearchKeyboard(),
      Message.CompletedScrollPageToTop(),
      Message.ClickedDomainsHome(),
      Message.ClickedSkipToMain(),
    ]
    for (const msg of noops) {
      const step = update(m0, msg)
      expect(step.model).toBe(m0)
      expect(step.commands ?? []).toEqual([])
    }

    // Command-only Messages keep Model identity and emit their Commands.
    const focused = update(m0, Message.FocusedResultsList())
    expect(focused.model).toBe(m0)
    expect(focused.commands?.length).toBe(1)

    const scrolled = update(m0, Message.PressedResultsListScrollKey({ key: 'PageDown' }))
    expect(scrolled.model).toBe(m0)
    expect(scrolled.commands?.length).toBe(1)

    const internalLink = update(
      m0,
      Message.ClickedLink({ request: UrlRequest.Internal({ url: internalUrl }) }),
    )
    expect(internalLink.model).toBe(m0)
    expect(internalLink.commands?.length).toBe(1)

    const externalLink = update(
      m0,
      Message.ClickedLink({ request: UrlRequest.External({ href: 'https://example.org' }) }),
    )
    expect(externalLink.model).toBe(m0)
    expect(externalLink.commands?.length).toBe(1)

    // Field writes: UpdatedTldSearch, ClickedRemoveDomain, ClickedRemoveCartDomain.
    const m1 = update(m0, Message.UpdatedTldSearch({ value: 'dev' })).model
    expect(m1.tldSearchQuery).toBe('dev')
    // Same value again keeps identity.
    expect(update(m1, Message.UpdatedTldSearch({ value: 'dev' })).model).toBe(m1)

    // Removing a missing domain keeps identity.
    expect(update(m1, Message.ClickedRemoveDomain({ name: 'missing.com' })).model).toBe(m1)

    const m2 = update(m1, Message.ClickedRemoveDomain({ name: 'acme.com' })).model
    expect(m2.cart.map(d => d.name)).toEqual(['acme.io'])

    const removedFromCart = update(m2, Message.ClickedRemoveCartDomain({ name: 'acme.io' }))
    expect(removedFromCart.model.cart).toEqual([])
    expect(removedFromCart.commands?.length).toBe(1)
  })
})
