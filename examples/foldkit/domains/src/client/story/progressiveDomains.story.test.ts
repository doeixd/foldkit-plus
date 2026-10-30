import { Array, Option } from 'effect'
import { Command, given, message, model, steps, story } from 'foldkit/story'
import { modifyFields } from 'foldkit/struct'
import { toParentMessage } from 'foldkit/test'
import { describe, expect, test } from 'vitest'

import { VirtualList } from '@foldkit/ui'

import { domainTlds } from '../../shared/domain'
import { makeDomainFixtures } from '../../shared/domain.fixture'
import { FocusSearchInput, ReadCurrentTime } from '../command'
import { ResultsListBinding } from '../composition'
import { DomainListing, SortOrder } from '../domain'
import { DomainsQueryFailure } from '../domainsQuery'
import { Message } from '../message'
import { emptyModel, urlOrThrow, withDomainsForRange } from '../model.fixture'
import { resultListings } from '../resultListings'
import { ResultsListBlock } from '../resultsList'
import { ApplicationRoute } from '../route'
import {
  DomainRequestPresentation,
  SearchViewState,
  searchViewState,
} from '../searchViewState'
import { update } from '../update'
import {
  makeDomainsFetch,
  resolveDomainsFailure,
  resolveDomainsSuccess,
  resolveResultsListScrolls,
  resolveSearchTime,
} from './test'

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
const laterArgs = {
  label: 'acme',
  offset: 180,
  limit: 60,
}
const catalogArgs = {
  label: 'acme',
  offset: 0,
  limit: domainTlds.length,
}
const allDomains = makeDomainFixtures('acme')
const firstPageDomains = Array.take(allDomains, 60)
const secondPageDomains = Array.take(Array.drop(allDomains, 60), 60)
const laterPageDomains = Array.take(Array.drop(allDomains, 180), 60)
const partialModel = withDomainsForRange(
  modifyFields(emptyModel, {
    route: () => ApplicationRoute.Search({ q: Option.some('acme') }),
    searchGeneration: () => 1,
  }),
  firstArgs,
  firstPageDomains,
)
const pageFailure = DomainsQueryFailure.make({
  error: 'Sample service unavailable',
})

const scroll = (scrollTop: number) =>
  toParentMessage(
    ResultsListBinding,
    ResultsListBlock.Message.ObservedContainerScroll({
      scrollTop,
      scrollHeight: 10_600,
      containerHeight: 400,
      anchor: VirtualList.ObservedAnchor.None(),
    }),
  )

const failPageAroundCriteriaChange = (
  criteriaMessage: Message,
  isBeforeFailure: boolean,
) =>
  isBeforeFailure
    ? steps(
        message(criteriaMessage),
        resolveDomainsFailure(secondArgs, 2, pageFailure, 20),
      )
    : steps(
        resolveDomainsFailure(secondArgs, 2, pageFailure, 20),
        message(criteriaMessage),
      )

describe('progressive domain results', () => {
  test.each(
    Array.filter(
      SortOrder.literals,
      sortOrder => sortOrder === 'Length' || sortOrder === 'Alphabetical',
    ),
  )(
    '%s sorts pending names immediately and retries only the visible candidate range',
    sortOrder => {
      const topArgs = {
        label: 'acme',
        offset: 0,
        limit: 4,
      }
      const remainingArgs = {
        label: 'acme',
        offset: 4,
        limit: 56,
      }
      const loadingModel = modifyFields(emptyModel, {
        route: () => ApplicationRoute.Search({ q: Option.some('acme') }),
      })
      const expectedNames =
        sortOrder === 'Length'
          ? ['acme.ac', 'acme.ag', 'acme.ai', 'acme.am', 'acme.au']
          : [
              'acme.ac',
              'acme.academy',
              'acme.accountant',
              'acme.accountants',
              'acme.actor',
            ]

      story(
        update,
        given(loadingModel),
        message(Message.UpdatedSortOrder({ value: sortOrder })),
        model(model => {
          const listings = resultListings(model)

          expect(
            Array.map(Array.take(listings, 5), listing => listing.name),
          ).toEqual(expectedNames)
          expect(Array.every(listings, DomainListing.guards.Pending)).toBe(true)
        }),
        resolveResultsListScrolls,
        Command.expectNone(),
        message(Message.RequestedSearch()),
        resolveSearchTime(1, 0),
        Command.expectHas(makeDomainsFetch(topArgs, 1)),
        resolveDomainsSuccess(topArgs, 1, Array.take(allDomains, 4), 5),
        model(model => {
          const listings = resultListings(model)

          expect(
            Array.map(Array.take(listings, 5), listing => listing.name),
          ).toEqual(expectedNames)
          expect(Option.getOrThrow(Array.head(listings))).toEqual(
            DomainListing.Pending({ name: 'acme.ac', tld: 'ac' }),
          )
          expect(
            Array.findFirst(listings, listing => listing.name === 'acme.com'),
          ).toEqual(
            Option.some(
              DomainListing.Ready({
                name: 'acme.com',
                tld: 'com',
                domain: Option.getOrThrow(Array.head(allDomains)),
              }),
            ),
          )
        }),
        resolveResultsListScrolls,
        Command.expectExact(
          ReadCurrentTime({
            searchGeneration: 1,
            offset: 4,
            limit: 56,
            isRefreshRequested: false,
          }),
        ),
        resolveSearchTime(1, 10, 4, 56),
        resolveResultsListScrolls,
        Command.expectExact(makeDomainsFetch(remainingArgs, 2)),
        resolveDomainsFailure(remainingArgs, 2, pageFailure, 20),
        message(Message.ClickedRetrySearch()),
        Command.resolve(FocusSearchInput, Message.CompletedFocusSearchInput()),
        resolveResultsListScrolls,
        Command.expectExact(
          ReadCurrentTime({
            searchGeneration: 1,
            offset: 4,
            limit: 56,
            isRefreshRequested: true,
          }),
        ),
        resolveSearchTime(1, 30, 4, 56, true),
        resolveResultsListScrolls,
        Command.expectExact(makeDomainsFetch(remainingArgs, 3)),
        resolveDomainsFailure(remainingArgs, 3, pageFailure, 40),
        resolveResultsListScrolls,
        Command.expectNone(),
      )
    },
  )

  test('shows Top Results before the rest of the first page and ignores a duplicate planning Clock while pending', () => {
    const topArgs = {
      label: 'acme',
      offset: 0,
      limit: 4,
    }
    const remainingArgs = {
      label: 'acme',
      offset: 4,
      limit: 56,
    }
    const topDomains = Array.take(allDomains, 4)

    story(
      update,
      given(emptyModel),
      message(
        Message.ChangedUrl({ url: urlOrThrow('http://localhost/?q=acme') }),
      ),
      resolveSearchTime(1, 0),
      Command.expectHas(makeDomainsFetch(topArgs, 1)),
      message(Message.RequestedDomains({ offset: 0, limit: 4 })),
      resolveSearchTime(1, 1),
      Command.expectHas(makeDomainsFetch(topArgs, 1)),
      resolveDomainsSuccess(topArgs, 1, topDomains, 10),
      model(model => {
        expect(searchViewState(model)).toEqual(
          SearchViewState.Ready({ domains: topDomains }),
        )
      }),
      resolveSearchTime(1, 10, 4, 56),
      Command.expectHas(makeDomainsFetch(remainingArgs, 2)),
      model(model => {
        expect(searchViewState(model)).toEqual(
          SearchViewState.Ready({
            domains: topDomains,
            domainRequest: DomainRequestPresentation.Loading({
              offset: 4,
              limit: 56,
            }),
          }),
        )
      }),
      resolveDomainsSuccess(
        remainingArgs,
        2,
        Array.drop(firstPageDomains, 4),
        20,
      ),
      model(model => {
        expect(searchViewState(model)).toEqual(
          SearchViewState.Ready({ domains: firstPageDomains }),
        )
      }),
      resolveResultsListScrolls,
      Command.expectNone(),
    )
  })

  test('loads the latest viewport after the current page completes', () => {
    story(
      update,
      given(partialModel),
      message(scroll(1140)),
      resolveSearchTime(1, 10, 60, 60),
      Command.expectHas(makeDomainsFetch(secondArgs, 2)),
      message(scroll(3762)),
      resolveDomainsSuccess(secondArgs, 2, secondPageDomains, 20),
      Command.expectHas(
        ReadCurrentTime({
          searchGeneration: 1,
          offset: 180,
          limit: 60,
          isRefreshRequested: false,
        }),
      ),
      resolveSearchTime(1, 30, 180, 60),
      Command.expectHas(makeDomainsFetch(laterArgs, 3)),
      resolveDomainsSuccess(laterArgs, 3, laterPageDomains, 40),
      model(model => {
        const viewState = searchViewState(model)
        expect(viewState._tag).toBe('Ready')

        if (viewState._tag === 'Ready') {
          expect(viewState.domains).toHaveLength(180)
          expect(viewState.domainRequest._tag).toBe('Idle')
        }
      }),
      resolveResultsListScrolls,
      Command.expectNone(),
    )
  })

  test('a later failure preserves checked domain results, retries only that page, and global sort loads the catalog', () => {
    story(
      update,
      given(partialModel),
      message(scroll(1140)),
      resolveSearchTime(1, 10, 60, 60),
      resolveDomainsFailure(secondArgs, 2, pageFailure, 20),
      model(model => {
        expect(searchViewState(model)).toEqual(
          SearchViewState.Ready({
            domains: firstPageDomains,
            domainRequest: DomainRequestPresentation.Failed({
              offset: 60,
              limit: 60,
              error: 'Sample service unavailable',
            }),
          }),
        )
      }),
      message(scroll(1140)),
      message(Message.ClickedRetrySearch()),
      Command.resolve(FocusSearchInput, Message.CompletedFocusSearchInput()),
      resolveSearchTime(1, 30, 60, 60, true),
      Command.expectHas(makeDomainsFetch(secondArgs, 3)),
      resolveDomainsSuccess(secondArgs, 3, secondPageDomains, 40),
      message(Message.UpdatedSortOrder({ value: 'PriceAscending' })),
      resolveSearchTime(1, 50, 0, domainTlds.length),
      Command.expectHas(makeDomainsFetch(catalogArgs, 4)),
      resolveDomainsSuccess(catalogArgs, 4, allDomains, 60),
      model(model => {
        expect(model.sortOrder).toBe('PriceAscending')
        expect(searchViewState(model)).toEqual(
          SearchViewState.Ready({ domains: allDomains }),
        )
      }),
      resolveResultsListScrolls,
      Command.expectNone(),
    )
  })

  test.each([
    {
      criteria: 'price sorting',
      timing: 'before the page failure',
      message: Message.UpdatedSortOrder({ value: 'PriceAscending' }),
      isBeforeFailure: true,
    },
    {
      criteria: 'price sorting',
      timing: 'after the page failure',
      message: Message.UpdatedSortOrder({ value: 'PriceAscending' }),
      isBeforeFailure: false,
    },
    {
      criteria: 'availability filtering',
      timing: 'before the page failure',
      message: Message.UpdatedAvailabilityFilter({ value: 'Available' }),
      isBeforeFailure: true,
    },
    {
      criteria: 'availability filtering',
      timing: 'after the page failure',
      message: Message.UpdatedAvailabilityFilter({ value: 'Available' }),
      isBeforeFailure: false,
    },
  ])(
    '$criteria changed $timing replaces the failed page with a complete catalog',
    ({ message: criteriaMessage, isBeforeFailure }) => {
      story(
        update,
        given(partialModel),
        message(scroll(1140)),
        resolveSearchTime(1, 10, 60, 60),
        failPageAroundCriteriaChange(criteriaMessage, isBeforeFailure),
        Command.expectHas(
          ReadCurrentTime({
            searchGeneration: 1,
            offset: 0,
            limit: domainTlds.length,
            isRefreshRequested: false,
          }),
        ),
        resolveSearchTime(1, 30, 0, domainTlds.length),
        Command.expectHas(makeDomainsFetch(catalogArgs, 3)),
        model(model => {
          expect(searchViewState(model)).toEqual(
            SearchViewState.Ready({
              domains: firstPageDomains,
              domainRequest: DomainRequestPresentation.Loading({
                offset: 0,
                limit: domainTlds.length,
              }),
            }),
          )
        }),
        resolveDomainsSuccess(catalogArgs, 3, allDomains, 40),
        model(model => {
          expect(searchViewState(model)).toEqual(
            SearchViewState.Ready({ domains: allDomains }),
          )
        }),
        resolveResultsListScrolls,
        Command.expectNone(),
      )
    },
  )

  test('a failed complete catalog waits for explicit retry and retries that catalog', () => {
    story(
      update,
      given(partialModel),
      message(Message.UpdatedSortOrder({ value: 'PriceAscending' })),
      resolveSearchTime(1, 10, 0, domainTlds.length),
      resolveDomainsFailure(catalogArgs, 2, pageFailure, 20),
      model(model => {
        expect(searchViewState(model)).toEqual(
          SearchViewState.Ready({
            domains: firstPageDomains,
            domainRequest: DomainRequestPresentation.Failed({
              offset: 0,
              limit: domainTlds.length,
              error: pageFailure.error,
            }),
          }),
        )
      }),
      message(scroll(1140)),
      resolveResultsListScrolls,
      Command.expectNone(),
      message(Message.ClickedRetrySearch()),
      Command.resolve(FocusSearchInput, Message.CompletedFocusSearchInput()),
      resolveSearchTime(1, 30, 0, domainTlds.length, true),
      Command.expectHas(makeDomainsFetch(catalogArgs, 3)),
      resolveDomainsSuccess(catalogArgs, 3, allDomains, 40),
      model(model => {
        expect(model.selectedDomainRanges).toEqual([
          { offset: 0, limit: domainTlds.length },
        ])
        expect(searchViewState(model)).toEqual(
          SearchViewState.Ready({ domains: allDomains }),
        )
      }),
      resolveResultsListScrolls,
      Command.expectNone(),
    )
  })
})
