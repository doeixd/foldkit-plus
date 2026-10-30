import { Array, Option, Result } from 'effect'
import {
  Command,
  Mount,
  Navigation,
  type SceneSimulation,
  all,
  click,
  expect,
  expectAll,
  expectHandled,
  filter,
  first,
  given,
  inside,
  keydown,
  label,
  role,
  scene,
  selector,
  submit,
  text,
  type,
  within,
} from 'foldkit/scene'
import { modifyFields } from 'foldkit/struct'
import { describe, test } from 'vitest'

import {
  Animation,
  Dialog,
  DialogBlock,
  Listbox,
  VirtualList,
} from '@foldkit/ui'

import { Domain, domainCandidates, domainTlds } from '../shared/domain'
import { makeDomainFixtures } from '../shared/domain.fixture'
import {
  DismissSearchKeyboard,
  FocusCartButton,
  FocusCartCloseButton,
  FocusFiltersButton,
  FocusSearchInput,
  FocusTldFilterButton,
  ReadCurrentTime,
  ReplaceSearchUrl,
  ScrollPage,
} from './command'
import { DOMAIN_PAGE_SIZE, TOP_RESULT_COUNT } from './domain'
import { DomainsQuery, DomainsQueryFailure } from './domainsQuery'
import { SortListboxBlock, TldListboxBlock } from './filterListboxes'
import { Message } from './message'
import { emptyModel, readyModel, withDomainsForRange } from './model.fixture'
import { PageScrollKey, RESULTS_LIST_ID, ResultsListBlock } from './resultsList'
import { ApplicationRoute } from './route'
import { update } from './update'
import { view } from './view'

const domainResults = role('region', { name: 'Domain results' })
const allDomainResults = role('list', { name: 'All domain results' })
const domainResultItems = filter(all.role('listitem'), { hasNot: role('list') })
const firstDomainResult = within(allDomainResults, first(domainResultItems))

const openFilterListbox = (
  name: string,
  id: string,
  listboxMessage: typeof TldListboxBlock.Message,
) => [
  click(
    within(
      selector(`#${id}-button`),
      role('button', { name: new RegExp(`^${name}`) }),
    ),
  ),
  Command.resolve(
    Listbox.test.FocusListboxItems({ id }),
    listboxMessage.CompletedFocusListboxItems(),
  ),
  Mount.resolve(
    Listbox.test.AnchorListbox,
    listboxMessage.CompletedAnchorListbox(),
  ),
  Mount.resolve(
    Listbox.test.PortalListboxBackdrop,
    listboxMessage.CompletedPortalListboxBackdrop(),
  ),
]

const closeFilterListbox = (
  id: string,
  listboxMessage: typeof TldListboxBlock.Message,
) => [
  Command.resolve(
    Listbox.test.FocusListboxButton({ id }),
    listboxMessage.CompletedFocusListboxButton(),
  ),
  Mount.expectEnded(
    Listbox.test.AnchorListbox,
    Listbox.test.PortalListboxBackdrop,
  ),
]

const selectFilterOption = (
  name: string,
  option: string,
  id: string,
  listboxMessage: typeof TldListboxBlock.Message,
) => [
  ...openFilterListbox(name, id, listboxMessage),
  click(role('option', { name: option })),
  ...closeFilterListbox(id, listboxMessage),
]

const acknowledgeTldSheetOpen = (generation: number) => [
  Command.resolve(
    Dialog.test.ShowDialog,
    DialogBlock.Message.SucceededShowDialog(),
  ),
  Command.resolveAll(
    [
      Animation.test.WaitForPaint,
      Animation.AnimationBlock.Message.CompletedWaitForPaint({ generation }),
    ],
    [
      Animation.test.WaitForPaint,
      Animation.AnimationBlock.Message.CompletedWaitForPaint({ generation }),
    ],
    [
      Animation.test.WaitForAnimationSettled,
      Animation.AnimationBlock.Message.EndedAnimation({ generation }),
    ],
  ),
]

const acknowledgeTldSheetClose = (generation: number) => [
  Command.resolve(
    Animation.test.WaitForPaint,
    Animation.AnimationBlock.Message.CompletedWaitForPaint({ generation }),
  ),
  Command.resolve(
    Animation.test.WaitForAnimationSettled,
    Animation.AnimationBlock.Message.EndedAnimation({ generation }),
  ),
  Command.resolve(
    Dialog.test.CloseDialog,
    DialogBlock.Message.CompletedCloseDialog(),
  ),
  Command.resolve(
    FocusTldFilterButton,
    Message.CompletedFocusTldFilterButton(),
  ),
]

const resolveResultsListScrolls = <Model, Message, OutMessage>(
  simulation: SceneSimulation<Model, Message, OutMessage>,
): SceneSimulation<Model, Message, OutMessage> =>
  Array.reduce(simulation.commands, simulation, (current, command) =>
    Option.match(Command.argsOf(VirtualList.test.ApplyScroll)(command), {
      onNone: () => current,
      onSome: args =>
        Command.resolve(
          VirtualList.test.ApplyScroll(args),
          ResultsListBlock.Message.CompletedApplyScroll({
            version: args.version,
            outcome: VirtualList.ApplyScrollOutcome.Skipped(),
          }),
        )(current),
    }),
  )

const resolveSearchPlanningTime =
  (nowMillis = 0) =>
  <Model, Message_, OutMessage>(
    simulation: SceneSimulation<Model, Message_, OutMessage>,
  ): SceneSimulation<Model, Message_, OutMessage> =>
    Array.reduce(simulation.commands, simulation, (current, command) =>
      Option.match(Command.argsOf(ReadCurrentTime)(command), {
        onNone: () => current,
        onSome: args =>
          Command.resolve(
            ReadCurrentTime(args),
            Message.CompletedReadCurrentTime({ ...args, nowMillis }),
          )(current),
      }),
    )

const resolveDomains =
  (
    domainLabel: string,
    result: Result.Result<ReadonlyArray<Domain>, DomainsQueryFailure>,
    offset = 0,
    limit = TOP_RESULT_COUNT,
  ) =>
  <Model, Message_, OutMessage>(
    simulation: SceneSimulation<Model, Message_, OutMessage>,
  ) => {
    const args = Option.getOrThrow(
      Array.findFirst(
        Array.getSomes(
          Array.map(simulation.commands, Command.argsOf(DomainsQuery.Fetch)),
        ),
        fetch =>
          fetch.args.label === domainLabel &&
          fetch.args.offset === offset &&
          fetch.args.limit === limit,
      ),
    )

    return Command.resolve(
      DomainsQuery.Fetch(args),
      DomainsQuery.Message.CompletedFetch({
        ...args,
        result,
        completedAtMillis: 0,
      }),
    )(simulation)
  }

const resolveRemainingFirstPageDomains = resolveDomains(
  'acme',
  Result.succeed(
    Array.take(
      Array.drop(makeDomainFixtures('acme'), TOP_RESULT_COUNT),
      DOMAIN_PAGE_SIZE - TOP_RESULT_COUNT,
    ),
  ),
  TOP_RESULT_COUNT,
  DOMAIN_PAGE_SIZE - TOP_RESULT_COUNT,
)

const measureResultsList = Mount.resolve(
  VirtualList.test.ObserveVirtualList({
    id: RESULTS_LIST_ID,
    scrollContainer: VirtualList.ScrollContainer.Window(),
  }),
  ResultsListBlock.Message.ResizedContainer({
    containerWidth: 1000,
    containerHeight: 400,
  }),
)

describe('domain search', () => {
  test('landing HTML renders skeletons without mounting virtual results', () => {
    scene(
      { update, view },
      given(emptyModel),
      expect(text('Unofficial demo')).toExist(),
      expect(role('link', { name: 'Vercel pricing' })).toHaveAttr(
        'href',
        'https://vercel.com/domains/pricing',
      ),
      expect(selector('.results-preview')).toExist(),
      expect(allDomainResults).toBeAbsent(),
      Mount.expectNone(),
    )
  })

  test('typing makes Top Results usable before the remaining domain checks complete', () => {
    scene(
      { update, view, routing: { onUrlChange: Message.ChangedUrl } },
      given(emptyModel),
      type(label('Search domains'), 'acme'),
      Command.resolveAllExact([
        ReplaceSearchUrl({ q: Option.some('acme') }),
        Message.CompletedReplaceSearchUrl(),
      ]),
      Command.expectNone(),
      Navigation.changedUrl('/?q=acme'),
      Command.expectHas(ReadCurrentTime),
      resolveSearchPlanningTime(),
      measureResultsList,
      inside(domainResults, expect(text(/\$/)).toBeAbsent()),
      resolveDomains(
        'acme',
        Result.succeed(
          Array.take(makeDomainFixtures('acme'), TOP_RESULT_COUNT),
        ),
      ),
      resolveResultsListScrolls,
      expect(label('Search domains')).toHaveValue('acme'),
      inside(allDomainResults, expect(text('acme.com')).toExist()),
      inside(firstDomainResult, expect(text('$12.00')).toExist()),
      Command.expectHas(ReadCurrentTime),
      resolveSearchPlanningTime(1),
      resolveResultsListScrolls,
      Command.keepPending(DomainsQuery.Fetch),
      inside(
        first(all.role('article')),
        expect(text('$12.00')).toExist(),
        expect(role('button', { name: 'Add acme.com to cart' })).toExist(),
        click(role('button', { name: 'Add acme.com to cart' })),
      ),
      expect(role('button', { name: 'Cart, 1 domains' })).toExist(),
      expect(
        text('4 of 556 domains checked · Registration prices in USD'),
      ).toExist(),
      inside(allDomainResults, expect(text('$80.00')).toBeAbsent()),
      inside(firstDomainResult, expect(text('$12.00')).toExist()),
      resolveRemainingFirstPageDomains,
      resolveResultsListScrolls,
      inside(first(all.role('article')), expect(text('$12.00')).toExist()),
      inside(allDomainResults, expect(text('$80.00')).toExist()),
      expect(
        text('60 of 556 domains checked · Registration prices in USD'),
      ).toExist(),
      Command.expectNone(),
    )
  })

  test('measuring results renders a bounded window of the catalog', () => {
    scene(
      { update, view },
      given(readyModel('acme')),
      measureResultsList,
      inside(
        allDomainResults,
        expect(text('acme.com')).toExist(),
        expect(text('acme.zone')).toBeAbsent(),
      ),
      expect(allDomainResults).toHaveAttr('tabIndex', '0'),
      expect(text('556 domains · Registration prices in USD')).toExist(),
    )
  })

  test('refresh hides availability, prices, and cart actions until the new result arrives', () => {
    scene(
      { update, view },
      given(readyModel('acme')),
      measureResultsList,
      submit(role('search')),
      Command.resolve(
        DismissSearchKeyboard,
        Message.CompletedDismissSearchKeyboard(),
      ),
      resolveSearchPlanningTime(),
      resolveResultsListScrolls,
      inside(
        domainResults,
        expect(text(/\$/)).toBeAbsent(),
        expect(text('Not available')).toBeAbsent(),
        expect(role('button', { name: 'Add acme.com to cart' })).toBeAbsent(),
      ),
      resolveDomains(
        'acme',
        Result.succeed(
          Array.take(makeDomainFixtures('acme'), TOP_RESULT_COUNT),
        ),
      ),
      resolveResultsListScrolls,
      inside(firstDomainResult, expect(text('$12.00')).toExist()),
      resolveSearchPlanningTime(1),
      resolveRemainingFirstPageDomains,
      resolveResultsListScrolls,
      Command.expectNone(),
    )
  })

  test('filters and sorting control the same domain results', () => {
    scene(
      { update, view },
      given(readyModel('acme')),
      measureResultsList,
      ...selectFilterOption(
        'Filter by TLD',
        '.app',
        'tld-filter',
        TldListboxBlock.Message,
      ),
      resolveResultsListScrolls,
      inside(
        allDomainResults,
        expectAll(domainResultItems).toHaveCount(1),
        expect(text('acme.app')).toExist(),
      ),
      ...selectFilterOption(
        'Filter by TLD',
        'All TLDs',
        'tld-filter',
        TldListboxBlock.Message,
      ),
      resolveResultsListScrolls,
      ...selectFilterOption(
        'Sort results',
        'Price: High to Low',
        'sort-order',
        SortListboxBlock.Message,
      ),
      resolveResultsListScrolls,
      inside(firstDomainResult, expect(text('acme.ai')).toExist()),
      ...selectFilterOption(
        'Sort results',
        'Price: Low to High',
        'sort-order',
        SortListboxBlock.Message,
      ),
      resolveResultsListScrolls,
      inside(firstDomainResult, expect(text('acme.space')).toExist()),
    )
  })

  test('failed searches expose a retriable alert without stale prices', () => {
    scene(
      { update, view, routing: { onUrlChange: Message.ChangedUrl } },
      given(emptyModel),
      Navigation.changedUrl('/?q=acme'),
      resolveSearchPlanningTime(),
      measureResultsList,
      resolveDomains(
        'acme',
        Result.fail(
          DomainsQueryFailure.make({
            error: 'Search unavailable',
          }),
        ),
      ),
      Mount.expectEnded(VirtualList.test.ObserveVirtualList),
      resolveResultsListScrolls,
      expect(role('alert')).toContainText('Search unavailable'),
      inside(domainResults, expect(text(/\$/)).toBeAbsent()),
      click(role('button', { name: 'Try again' })),
      Command.resolve(FocusSearchInput, Message.CompletedFocusSearchInput()),
      resolveSearchPlanningTime(),
      measureResultsList,
      resolveDomains(
        'acme',
        Result.succeed(
          Array.take(makeDomainFixtures('acme'), TOP_RESULT_COUNT),
        ),
      ),
      resolveResultsListScrolls,
      inside(firstDomainResult, expect(text('$12.00')).toExist()),
      resolveSearchPlanningTime(1),
      resolveRemainingFirstPageDomains,
      resolveResultsListScrolls,
      Command.expectNone(),
    )
  })
})

describe('filters presentation', () => {
  test('the mobile TLD sheet searches the catalog, applies selection, and resets search when reopened', () => {
    scene(
      { update, view },
      given(readyModel('acme')),
      measureResultsList,
      click(selector('.mobile-tld-filter')),
      ...acknowledgeTldSheetOpen(1),
      inside(
        role('dialog', { name: 'Filter by TLD' }),
        expect(role('searchbox', { name: 'Search TLDs' })).toHaveValue(''),
        type(role('searchbox', { name: 'Search TLDs' }), 'no-such-tld'),
        expect(text('No TLDs found.')).toExist(),
        expect(role('button', { name: '.academy' })).toBeAbsent(),
        type(role('searchbox', { name: 'Search TLDs' }), ' .AcAdEmY '),
        expect(text('No TLDs found.')).toBeAbsent(),
        expect(role('button', { name: '.academy' })).toExist(),
        expect(role('button', { name: '.com' })).toBeAbsent(),
        click(role('button', { name: '.academy' })),
      ),
      resolveResultsListScrolls,
      ...acknowledgeTldSheetClose(2),
      expect(role('dialog', { name: 'Filter by TLD' })).toBeAbsent(),
      expect(selector('.mobile-tld-filter')).toHaveText('.academy'),
      inside(
        allDomainResults,
        expectAll(domainResultItems).toHaveCount(1),
        expect(text('acme.academy')).toExist(),
        expect(text('acme.com')).toBeAbsent(),
      ),
      click(selector('.mobile-tld-filter')),
      ...acknowledgeTldSheetOpen(3),
      inside(
        role('dialog', { name: 'Filter by TLD' }),
        expect(role('searchbox', { name: 'Search TLDs' })).toHaveValue(''),
        expect(role('button', { name: '.academy' })).toHaveAttr(
          'aria-pressed',
          'true',
        ),
        expect(role('button', { name: 'All TLDs' })).toHaveAttr(
          'aria-pressed',
          'false',
        ),
        click(role('button', { name: 'All TLDs' })),
      ),
      resolveResultsListScrolls,
      ...acknowledgeTldSheetClose(4),
      expect(selector('.mobile-tld-filter')).toHaveText('All TLDs'),
      inside(
        allDomainResults,
        expect(text('acme.com')).toExist(),
        expect(text('acme.app')).toExist(),
      ),
      Command.expectNone(),
    )
  })

  test('keyboard navigation commits the TLD filter without changing selection during navigation', () => {
    scene(
      { update, view },
      given(readyModel('acme')),
      measureResultsList,
      ...openFilterListbox(
        'Filter by TLD',
        'tld-filter',
        TldListboxBlock.Message,
      ),
      expect(role('option', { name: 'All TLDs' })).toHaveAttr(
        'aria-selected',
        'true',
      ),
      keydown(role('listbox'), 'ArrowDown'),
      expectHandled(),
      Command.resolve(
        Listbox.test.ScrollListboxItemIntoView({ id: 'tld-filter', index: 0 }),
        TldListboxBlock.Message.CompletedScrollListboxItemIntoView(),
      ),
      keydown(role('listbox'), 'ArrowDown'),
      expectHandled(),
      Command.resolve(
        Listbox.test.ScrollListboxItemIntoView({ id: 'tld-filter', index: 1 }),
        TldListboxBlock.Message.CompletedScrollListboxItemIntoView(),
      ),
      expect(role('option', { name: '.com' })).toHaveAttr('data-active', ''),
      expect(role('option', { name: '.com' })).toHaveAttr(
        'aria-selected',
        'false',
      ),
      inside(allDomainResults, expect(text('acme.app')).toExist()),
      keydown(role('listbox'), 'Enter'),
      expectHandled(),
      Command.resolve(
        Listbox.test.ClickListboxItem({ id: 'tld-filter', index: 1 }),
        TldListboxBlock.Message.CompletedClickListboxItem(),
      ),
      click(role('option', { name: '.com' })),
      ...closeFilterListbox('tld-filter', TldListboxBlock.Message),
      resolveResultsListScrolls,
      expect(role('listbox')).toBeAbsent(),
      expect(
        within(
          selector('.desktop-tld-filter'),
          role('button', { name: /^Filter by TLD/ }),
        ),
      ).toHaveText('.com'),
      inside(
        allDomainResults,
        expectAll(domainResultItems).toHaveCount(1),
        expect(text('acme.com')).toExist(),
        expect(text('acme.app')).toBeAbsent(),
      ),
    )
  })

  test('the filters sheet applies selection to the results and restores its trigger on close', () => {
    scene(
      { update, view },
      given(readyModel('acme')),
      measureResultsList,
      click(role('button', { name: 'Filters and sort' })),
      Command.resolve(
        Dialog.test.ShowDialog,
        DialogBlock.Message.SucceededShowDialog(),
      ),
      Command.resolveAll(
        [
          Animation.test.WaitForPaint,
          Animation.AnimationBlock.Message.CompletedWaitForPaint({
            generation: 1,
          }),
        ],
        [
          Animation.test.WaitForPaint,
          Animation.AnimationBlock.Message.CompletedWaitForPaint({
            generation: 1,
          }),
        ],
        [
          Animation.test.WaitForAnimationSettled,
          Animation.AnimationBlock.Message.EndedAnimation({ generation: 1 }),
        ],
      ),
      inside(
        selector('.filters-panel'),
        expect(role('button', { name: 'Show All' })).toHaveAttr(
          'aria-pressed',
          'true',
        ),
        expect(role('button', { name: 'Relevance' })).toHaveAttr(
          'aria-pressed',
          'true',
        ),
        expect(role('listbox')).toBeAbsent(),
        click(role('button', { name: 'Price' })),
      ),
      resolveResultsListScrolls,
      Command.resolve(
        Animation.test.WaitForPaint,
        Animation.AnimationBlock.Message.CompletedWaitForPaint({
          generation: 2,
        }),
      ),
      Command.resolve(
        Animation.test.WaitForAnimationSettled,
        Animation.AnimationBlock.Message.EndedAnimation({ generation: 2 }),
      ),
      Command.resolve(
        Dialog.test.CloseDialog,
        DialogBlock.Message.CompletedCloseDialog(),
      ),
      Command.resolve(
        FocusFiltersButton,
        Message.CompletedFocusFiltersButton(),
      ),
      expect(selector('.filters-panel')).toBeAbsent(),
      expect(firstDomainResult).toHaveText('acme.space$1.99'),
    )
  })
})

describe('cart presentation', () => {
  test('card and list actions share cart state and totals follow removals', () => {
    scene(
      { update, view },
      given(readyModel('acme')),
      measureResultsList,
      inside(
        first(all.role('article')),
        click(role('button', { name: 'Add acme.com to cart' })),
      ),
      inside(
        allDomainResults,
        expect(role('button', { name: 'Remove acme.com from cart' })).toExist(),
        click(role('button', { name: 'Add acme.app to cart' })),
      ),
      click(role('button', { name: 'Cart, 2 domains' })),
      Command.resolve(
        Dialog.test.ShowDialog,
        DialogBlock.Message.SucceededShowDialog(),
      ),
      inside(
        role('region', { name: 'Your cart' }),
        expect(text('Registration total$21.99')).toExist(),
        click(role('button', { name: 'Remove acme.com' })),
        Command.resolve(
          FocusCartCloseButton,
          Message.CompletedFocusCartCloseButton(),
        ),
        expect(text('Registration total$9.99')).toExist(),
        click(role('button', { name: 'Close cart panel' })),
      ),
      Command.resolve(
        Dialog.test.CloseDialog,
        DialogBlock.Message.CompletedCloseDialog(),
      ),
      Command.resolve(FocusCartButton, Message.CompletedFocusCartButton()),
      expect(role('button', { name: 'Cart, 1 domains' })).toExist(),
    )
  })

  test('unconfirmed domains expose no purchase action', () => {
    scene(
      { update, view },
      given(readyModel('foldkit')),
      measureResultsList,
      expect(role('button', { name: 'Add foldkit.com to cart' })).toBeAbsent(),
      expect(role('button', { name: 'Add foldkit.dev to cart' })).toBeAbsent(),
      inside(firstDomainResult, expect(text('Not available')).toExist()),
    )
  })
})

test('multi-year quotes display and sort by the full registration price', () => {
  const quotedModel = withDomainsForRange(
    readyModel('acme'),
    {
      label: 'acme',
      offset: 0,
      limit: domainTlds.length,
    },
    Array.map(domainCandidates('acme'), candidate =>
      Option.getOrElse(
        Array.findFirst(
          [
            Domain.Unconfirmed({ name: 'acme.com', tld: 'com' }),
            Domain.Available({
              name: 'acme.ai',
              tld: 'ai',
              price: 160,
              renewalPrice: 170,
              years: 2,
              isPremium: true,
            }),
            Domain.Available({
              name: 'acme.dev',
              tld: 'dev',
              price: 13,
              renewalPrice: 14,
              years: 1,
              isPremium: false,
            }),
          ],
          domain => domain.name === candidate.name,
        ),
        () => Domain.Unconfirmed(candidate),
      ),
    ),
  )

  scene(
    { update, view },
    given(quotedModel),
    measureResultsList,
    expect(text('$160.00 / 2 years')).toExist(),
    ...selectFilterOption(
      'Sort results',
      'Price: Low to High',
      'sort-order',
      SortListboxBlock.Message,
    ),
    resolveResultsListScrolls,
    inside(firstDomainResult, expect(text('acme.dev')).toExist()),
    ...selectFilterOption(
      'Sort results',
      'Price: High to Low',
      'sort-order',
      SortListboxBlock.Message,
    ),
    resolveResultsListScrolls,
    inside(
      firstDomainResult,
      expect(text('acme.ai')).toExist(),
      expect(text('$160.00 / 2 years')).toExist(),
    ),
  )
})

describe('accessibility', () => {
  test('loading status is atomic and outside the busy results content', () => {
    scene(
      { update, view },
      given(readyModel('acme')),
      measureResultsList,
      submit(role('search')),
      Command.resolve(
        DismissSearchKeyboard,
        Message.CompletedDismissSearchKeyboard(),
      ),
      resolveSearchPlanningTime(),
      resolveResultsListScrolls,
      expect(role('status', { name: 'Searching domains' })).toHaveText(
        'Checking availability and prices…',
      ),
      expect(role('status')).toHaveAttr('aria-atomic', 'true'),
      expect(selector('[aria-busy]')).toHaveAttr('aria-busy', 'true'),
      inside(selector('[aria-busy]'), expect(role('status')).toBeAbsent()),
      resolveDomains(
        'acme',
        Result.succeed(
          Array.take(makeDomainFixtures('acme'), TOP_RESULT_COUNT),
        ),
      ),
      resolveResultsListScrolls,
      resolveSearchPlanningTime(1),
      expect(selector('[aria-busy]')).toHaveAttr('aria-busy', 'true'),
      resolveRemainingFirstPageDomains,
      resolveResultsListScrolls,
      expect(selector('[aria-busy]')).toHaveAttr('aria-busy', 'false'),
      Command.expectNone(),
    )
  })

  test('invalid input identifies the field and associates its error', () => {
    scene(
      { update, view },
      given(
        modifyFields(emptyModel, {
          route: () => ApplicationRoute.Search({ q: Option.some('bad!') }),
        }),
      ),
      expect(label('Search domains')).toHaveAttr('aria-invalid', 'true'),
      expect(label('Search domains')).toHaveAttr(
        'aria-describedby',
        'search-error',
      ),
      expect(selector('#search-error')).toHaveText(
        'Enter a domain name using letters, numbers, and hyphens (up to 63 characters).',
      ),
    )
  })
})

test('End scrolls through the bound virtual list operation', () => {
  scene(
    { update, view },
    given(readyModel('acme')),
    measureResultsList,
    keydown(allDomainResults, 'End'),
    expectHandled(),
    Command.expectExact(VirtualList.test.ApplyScroll),
    resolveResultsListScrolls,
  )
})

test.each(PageScrollKey.literals)(
  '%s in the focused list requests an instant page scroll',
  key => {
    scene(
      { update, view },
      given(readyModel('acme')),
      measureResultsList,
      keydown(allDomainResults, key),
      expectHandled(),
      Command.expectExact(ScrollPage({ key })),
      Command.resolve(ScrollPage({ key }), Message.CompletedScrollPage()),
    )
  },
)
