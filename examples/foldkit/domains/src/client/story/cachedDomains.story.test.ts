import { Array, Option } from 'effect'
import { AsyncData } from 'foldkit'
import { Command, given, message, model, story } from 'foldkit/story'
import { modifyFields } from 'foldkit/struct'
import { expect, test } from 'vitest'

import { Domain, domainTlds } from '../../shared/domain'
import { makeDomainFixtures } from '../../shared/domain.fixture'
import { FocusSearchInput } from '../command'
import { DomainsQuery, DomainsQueryFailure } from '../domainsQuery'
import { Message } from '../message'
import { emptyModel, withDomainsForRange } from '../model.fixture'
import { ApplicationRoute } from '../route'
import {
  DomainRequestPresentation,
  SearchViewState,
  searchViewState,
} from '../searchViewState'
import { update } from '../update'
import {
  changeSearchQuery,
  makeDomainsFetch,
  resolveDomainsFailure,
  resolveDomainsSuccess,
  resolveRemainingFirstPageDomains,
  resolveResultsListScrolls,
  resolveSearchTime,
} from './test'

test('a normalized fresh label restores after another label fails', () => {
  const acmeArgs = {
    label: 'acme',
    offset: 0,
    limit: 4,
  }
  const otherArgs = {
    label: 'other',
    offset: 0,
    limit: 4,
  }
  const acmeDomains = Array.take(makeDomainFixtures('acme'), 4)

  story(
    update,
    given(modifyFields(emptyModel, { tldFilter: () => 'Com' })),
    changeSearchQuery('Acme.dev', 2, 0),
    resolveDomainsSuccess(acmeArgs, 1, acmeDomains, 100),
    changeSearchQuery('other.dev', 4, 200),
    resolveDomainsFailure(
      otherArgs,
      2,
      DomainsQueryFailure.make({
        error: 'Sample data unavailable',
      }),
      220,
    ),
    model(model => {
      expect(searchViewState(model)).toEqual(
        SearchViewState.Failed({ error: 'Sample data unavailable' }),
      )
    }),
    changeSearchQuery('Acme.de', 6, 300),
    model(model => {
      expect(searchViewState(model)).toEqual(
        SearchViewState.Ready({ domains: acmeDomains }),
      )
      expect(DomainsQuery.read(model.domainsQuery, otherArgs)._tag).toBe(
        'Failure',
      )
    }),
    resolveResultsListScrolls,
    Command.expectNone(),
  )
})

test('fresh results expire one minute after completion even after reuse', () => {
  const acmeArgs = {
    label: 'acme',
    offset: 0,
    limit: 4,
  }
  const otherArgs = {
    label: 'other',
    offset: 0,
    limit: 4,
  }
  const acmeDomains = Array.take(makeDomainFixtures('acme'), 4)
  const otherDomains = Array.take(makeDomainFixtures('other'), 4)

  story(
    update,
    given(modifyFields(emptyModel, { tldFilter: () => 'Com' })),
    changeSearchQuery('acme', 2, 0),
    resolveDomainsSuccess(acmeArgs, 1, acmeDomains, 100),
    changeSearchQuery('other', 4, 1_000),
    resolveDomainsSuccess(otherArgs, 2, otherDomains, 1_000),
    changeSearchQuery('acme', 6, 60_099),
    model(model => {
      expect(searchViewState(model)).toEqual(
        SearchViewState.Ready({ domains: acmeDomains }),
      )
    }),
    changeSearchQuery('other', 8, 60_099),
    changeSearchQuery('acme', 10, 60_100),
    Command.expectHas(makeDomainsFetch(acmeArgs, 3)),
    model(model => {
      expect(searchViewState(model)).toEqual(SearchViewState.Loading())
      expect(DomainsQuery.read(model.domainsQuery, acmeArgs)._tag).toBe(
        'Refreshing',
      )
    }),
    resolveDomainsSuccess(acmeArgs, 3, acmeDomains, 60_120),
    resolveResultsListScrolls,
    Command.expectNone(),
  )
})

test('a failed stale refresh retains checked results and retry replaces them with the new quote', () => {
  const args = {
    label: 'acme',
    offset: 0,
    limit: 4,
  }
  const domains = Array.take(makeDomainFixtures('acme'), 4)
  const nextDomains = Array.map(domains, domain =>
    Domain.match(domain, {
      Available: domain => Domain.Available({ ...domain, price: 25 }),
      Unconfirmed: domain => domain,
    }),
  )
  const failure = DomainsQueryFailure.make({
    error: 'Sample data unavailable',
  })
  const cachedModel = withDomainsForRange(
    modifyFields(emptyModel, {
      route: () => ApplicationRoute.Search({ q: Option.some('acme') }),
      tldFilter: () => 'Com',
    }),
    args,
    domains,
    100,
  )

  story(
    update,
    given(cachedModel),
    message(Message.RequestedSearch()),
    resolveSearchTime(1, 60_100),
    model(model => {
      expect(searchViewState(model)).toEqual(SearchViewState.Loading())
    }),
    resolveDomainsFailure(args, 2, failure, 60_110),
    model(model => {
      expect(searchViewState(model)).toEqual(
        SearchViewState.Ready({
          domains,
          domainRequest: DomainRequestPresentation.Failed({
            offset: 0,
            limit: 4,
            error: failure.error,
          }),
        }),
      )
    }),
    message(Message.ClickedRetrySearch()),
    Command.resolve(FocusSearchInput, Message.CompletedFocusSearchInput()),
    resolveSearchTime(1, 60_120, 0, 4, true),
    resolveDomainsSuccess(args, 3, nextDomains, 60_130),
    model(model => {
      expect(searchViewState(model)).toEqual(
        SearchViewState.Ready({ domains: nextDomains }),
      )
    }),
    resolveResultsListScrolls,
    Command.expectNone(),
  )
})

test('label, offset, and limit isolate candidate ranges used by the application', () => {
  const firstArgs = {
    label: 'acme',
    offset: 0,
    limit: 60,
  }
  const secondArgs = {
    label: 'acme',
    offset: 60,
    limit: 60,
  }
  const catalogArgs = {
    label: 'acme',
    offset: 0,
    limit: domainTlds.length,
  }
  const firstPageDomains = Array.take(makeDomainFixtures('acme'), 60)
  const secondPageDomains = Array.take(
    Array.drop(makeDomainFixtures('acme'), 60),
    60,
  )
  const partialModel = withDomainsForRange(
    modifyFields(emptyModel, {
      route: () => ApplicationRoute.Search({ q: Option.some('acme') }),
      searchGeneration: () => 1,
    }),
    firstArgs,
    firstPageDomains,
  )

  story(
    update,
    given(partialModel),
    message(Message.RequestedDomains({ offset: 60, limit: 60 })),
    resolveSearchTime(1, 10, 60, 60),
    Command.expectHas(makeDomainsFetch(secondArgs, 2)),
    resolveDomainsSuccess(secondArgs, 2, secondPageDomains, 20),
    message(Message.UpdatedSortOrder({ value: 'PriceAscending' })),
    resolveSearchTime(1, 30, 0, domainTlds.length),
    Command.expectHas(makeDomainsFetch(catalogArgs, 3)),
    model(model => {
      expect(DomainsQuery.read(model.domainsQuery, firstArgs)).toEqual(
        AsyncData.Success({ data: firstPageDomains }),
      )
      expect(DomainsQuery.read(model.domainsQuery, secondArgs)).toEqual(
        AsyncData.Success({ data: secondPageDomains }),
      )
      expect(DomainsQuery.read(model.domainsQuery, catalogArgs)._tag).toBe(
        'Loading',
      )
    }),
    resolveDomainsSuccess(catalogArgs, 3, makeDomainFixtures('acme'), 40),
    resolveResultsListScrolls,
    Command.expectNone(),
  )
})

test('global criteria reuse a fresh catalog and prune an active failed page', () => {
  const firstArgs = {
    label: 'acme',
    offset: 0,
    limit: 60,
  }
  const secondArgs = {
    label: 'acme',
    offset: 60,
    limit: 60,
  }
  const catalogArgs = {
    label: 'acme',
    offset: 0,
    limit: domainTlds.length,
  }
  const allDomains = makeDomainFixtures('acme')
  const firstPageDomains = Array.take(allDomains, 60)
  const cachedModel = modifyFields(
    withDomainsForRange(
      withDomainsForRange(
        modifyFields(emptyModel, {
          route: () => ApplicationRoute.Search({ q: Option.some('acme') }),
          searchGeneration: () => 1,
        }),
        catalogArgs,
        allDomains,
        100,
      ),
      firstArgs,
      firstPageDomains,
      100,
    ),
    { selectedDomainRanges: () => [{ offset: 0, limit: 60 }] },
  )
  const pageFailure = DomainsQueryFailure.make({
    error: 'Sample service unavailable',
  })

  story(
    update,
    given(cachedModel),
    message(Message.RequestedDomains({ offset: 60, limit: 60 })),
    resolveSearchTime(1, 110, 60, 60),
    resolveDomainsFailure(secondArgs, 3, pageFailure, 115),
    model(model => {
      expect(searchViewState(model)).toEqual(
        SearchViewState.Ready({
          domains: firstPageDomains,
          domainRequest: DomainRequestPresentation.Failed({
            offset: 60,
            limit: 60,
            error: pageFailure.error,
          }),
        }),
      )
    }),
    message(Message.UpdatedAvailabilityFilter({ value: 'Available' })),
    resolveSearchTime(1, 120, 0, domainTlds.length),
    model(model => {
      expect(DomainsQuery.pendingArgs(model.domainsQuery)).toEqual([])
      expect(DomainsQuery.read(model.domainsQuery, secondArgs)._tag).toBe(
        'Failure',
      )
      expect(model.selectedDomainRanges).toEqual([
        { offset: 0, limit: domainTlds.length },
      ])
      expect(searchViewState(model)).toEqual(
        SearchViewState.Ready({
          domains: allDomains,
          domainRequest: DomainRequestPresentation.Idle(),
        }),
      )
    }),
    resolveResultsListScrolls,
    Command.expectNone(),
  )
})

test('backspacing to a fresh query reuses Top Results and the visible candidate range without fetching', () => {
  const acmeDomains = Array.take(makeDomainFixtures('acme'), 60)
  const acmesDomains = Array.take(makeDomainFixtures('acmes'), 60)

  story(
    update,
    given(emptyModel),
    changeSearchQuery('acme', 2, 0),
    resolveDomainsSuccess(
      {
        label: 'acme',
        offset: 0,
        limit: 4,
      },
      1,
      Array.take(acmeDomains, 4),
      100,
    ),
    resolveRemainingFirstPageDomains(
      'acme',
      2,
      2,
      Array.drop(acmeDomains, 4),
      100,
    ),
    changeSearchQuery('acmes', 4, 200),
    resolveDomainsSuccess(
      {
        label: 'acmes',
        offset: 0,
        limit: 4,
      },
      3,
      Array.take(acmesDomains, 4),
      300,
    ),
    resolveRemainingFirstPageDomains(
      'acmes',
      4,
      4,
      Array.drop(acmesDomains, 4),
      300,
    ),
    changeSearchQuery('acme', 6, 400),
    model(model => {
      expect(searchViewState(model)).toEqual(
        SearchViewState.Ready({ domains: Array.take(acmeDomains, 4) }),
      )
      expect(DomainsQuery.pendingArgs(model.domainsQuery)).toEqual([])
    }),
    resolveSearchTime(6, 400, 4, 56),
    model(model => {
      expect(searchViewState(model)).toEqual(
        SearchViewState.Ready({ domains: acmeDomains }),
      )
      expect(DomainsQuery.pendingArgs(model.domainsQuery)).toEqual([])
    }),
    resolveResultsListScrolls,
    Command.expectNone(),
  )
})
