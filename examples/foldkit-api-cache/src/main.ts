import * as UiButton from '@foldkit/ui/button'
import * as UiTabs from '@foldkit/ui/tabs'
import { Array, Duration, Match, Option, Schema } from 'effect'
import { Runtime, Subscription, Update } from 'foldkit'
import type { Document, Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import { Entity, type Selected } from 'foldkit-entity'
import { SlotView, Style, type NamedStyle, type SlotBuilders } from 'foldkit-mixins'
import { Button, ButtonSlots, Tabs } from 'foldkit-mixins-ui'
import { Remote, RemoteData, RemotePolicy, type RemoteClient } from 'foldkit-remote'
import { Surface } from 'foldkit-surface'

import { Post, PostsQuery, STATS_ID, Stats } from './data.js'
import {
  BackButtonStyle,
  PageSlots,
  PageStyle,
  PostButtonStyle,
  RetryButtonStyle,
  TabsStyle,
  ToolbarButtonStyle,
} from './style.js'

const STATS_MAX_AGE = Duration.seconds(5)

export const TABS_ID = 'api-cache-tabs'

// MODEL

const Tab = Schema.Literals(['Posts', 'Stats'])
type Tab = typeof Tab.Type

const tabValues: ReadonlyArray<Tab> = Tab.literals

const AppTabs: UiTabs.Bundle<Tab> = UiTabs.create<Tab>()

// The server's data is not a field per query: it is one `remote` Submodel,
// every entity stored once, field by field, and changed only by Remote's
// Messages.
export const Model = Schema.Struct({
  tabs: UiTabs.Model,
  activeTab: Tab,
  maybeSelectedPostId: Schema.Option(Schema.String),
  remote: Remote.Model,
})
export type Model = typeof Model.Type

// MESSAGE

export const Message = defineMessageUnion({
  GotTabsMessage: { message: UiTabs.Message },
  GotRemoteMessage: { message: Remote.Message },
  ClickedPost: { postId: Schema.String },
  ClickedBackToPosts: {},
  ClickedInvalidatePosts: {},
  ClickedRetryPosts: {},
  ClickedRetryPostDetail: { postId: Schema.String },
  ClickedRefreshStats: {},
  ClickedRetryStats: {},
})
export type Message = typeof Message.Type

// REMOTE

const App = Surface.application({ Model, Message })

export const Data = Remote.make({
  model: App.model.remote,
  entities: [Post, Stats],
  queries: [PostsQuery],
})

const foldData = Remote.fold(Data, message => Message.GotRemoteMessage({ message }))

// What each screen needs of the server's data. Reading one performs no I/O.

const PostRow = Entity.select(Post, { id: true, title: true, excerpt: true })

const PostDetail = Entity.select(Post, { title: true, author: true, body: true })

const StatsReading = Entity.select(Stats, {
  activeUsers: true,
  requestsPerSecond: true,
  cacheHitRatePercent: true,
  sampledAt: true,
})

export const postList = Data.query(PostsQuery, {}, { select: PostRow })

export const postDetail = (postId: string) => Data.get(PostDetail, postId)

export const stats = Data.get(StatsReading, STATS_ID)

// UPDATE

type UpdateReturn = Update.Return<Model, Message>

const foldTabsOutMessage = UiTabs.OutMessage.match<
  Update.Step<Model, Message>,
  UiTabs.OutMessage<Tab>
>({
  Selected:
    ({ value }) =>
    model => ({ model: modifyFields(model, { activeTab: () => value }) }),
})

const foldTabs = Update.foldChild({
  update: AppTabs.update,
  read: (model: Model) => Option.some(model.tabs),
  write: (model, nextTabs) => modifyFields(model, { tabs: () => nextTabs }),
  toParentMessage: message => Message.GotTabsMessage({ message }),
  foldOutMessage: foldTabsOutMessage,
})

// `Data.refresh` performs no I/O: it marks what a read shows as due again, and
// the read that is on screen fetches it, the old value still showing.
export const update = (model: Model, message: Message): UpdateReturn =>
  Message.match<UpdateReturn>(message, {
    GotTabsMessage: ({ message }) => foldTabs(model, message),

    GotRemoteMessage: ({ message }) => foldData(model, message),

    ClickedPost: ({ postId }) => ({
      model: modifyFields(model, { maybeSelectedPostId: () => Option.some(postId) }),
    }),

    ClickedBackToPosts: () => ({
      model: modifyFields(model, { maybeSelectedPostId: () => Option.none() }),
    }),

    ClickedInvalidatePosts: () => ({ model: Data.refresh(model, postList) }),

    ClickedRetryPosts: () => ({ model: Data.refresh(model, postList) }),

    ClickedRetryPostDetail: ({ postId }) => ({
      model: Data.refresh(model, postDetail(postId)),
    }),

    ClickedRefreshStats: () => ({ model: Data.refresh(model, stats) }),

    ClickedRetryStats: () => ({ model: Data.refresh(model, stats) }),
  })

// INIT

// Nothing to fetch here: the Posts tab is showing, so its read is active.
export const init: Runtime.ApplicationInit<Model, Message> = () => ({
  model: {
    tabs: UiTabs.init({ id: TABS_ID }),
    activeTab: 'Posts',
    maybeSelectedPostId: Option.none(),
    remote: Remote.initial,
  },
})

// SUBSCRIPTION

// A read is active while its tab is open. Remote fetches only what an active
// read lacks, and joins a request already in flight.

const readingPosts = Data.active('PostList', (model: Model) =>
  model.activeTab === 'Posts' ? Option.some(postList) : Option.none(),
)

const readingPost = Data.active('PostDetail', (model: Model) =>
  model.activeTab === 'Posts' ? Option.map(model.maybeSelectedPostId, postDetail) : Option.none(),
)

const readingStats = Data.active('Stats', (model: Model) =>
  model.activeTab === 'Stats' ? Option.some(stats) : Option.none(),
)

// NOTE: A policy covers a whole `Data.subscriptions` call, so the stats get a
// call of their own: stale-while-revalidate sleeps until the reading is five
// seconds old and fetches it again, which is the interval refetch. Only the
// read entries are installed. Each call's `retain` entry roots only its own
// reads, so the two would collect each other's data; without one, nothing is
// collected, and a post opened once stays cached for the session, as upstream.
export const subscriptions = Subscription.make<Model, Message, RemoteClient>()(() => {
  const cached = foldData.subscriptions({ posts: readingPosts, post: readingPost })
  const revalidated = foldData.subscriptions(
    { stats: readingStats },
    { policy: RemotePolicy.staleWhileRevalidate({ maxAge: Duration.toMillis(STATS_MAX_AGE) }) },
  )
  return {
    'posts.read': cached['posts.read'],
    'post.read': cached['post.read'],
    'stats.read': revalidated['stats.read'],
  }
})

// VIEW

type Slots = SlotBuilders<typeof PageSlots, Message>

const formatTime = (millis: number): string => new Date(millis).toLocaleTimeString()

const isPending = <A>(data: RemoteData<A>): boolean =>
  RemoteData.match(data, {
    Initial: () => false,
    Loading: () => true,
    Ready: () => false,
    Refreshing: () => true,
    Failed: () => false,
    NotFound: () => false,
  })

/** Whether there is a value to draw, fresh or not. */
const hasData = <A>(data: RemoteData<A>): boolean =>
  RemoteData.render(data, {
    loading: () => false,
    notFound: () => false,
    failed: () => false,
    data: () => true,
  })

const styledButton = (
  config: {
    readonly style: NamedStyle<typeof ButtonSlots>
    readonly onClick: Message
    readonly isDisabled?: boolean
    readonly content: ReadonlyArray<Html | string>
  },
  h: HtmlBuilder<Message>,
): Html =>
  UiButton.view(
    {
      onClick: config.onClick,
      isDisabled: config.isDisabled ?? false,
      toView: attributes =>
        h.button(
          Button.resolve<undefined, Message>(attributes, [config.style.mixin], {
            input: undefined,
            h,
          }).button,
          config.content,
        ),
    },
    h,
  )

export const Page = SlotView.forMessages<Message>()
  .define(PageSlots, (model: Model, slots, h) =>
    h.div(slots.page.attrs(), [
      h.div(slots.column.attrs(), [headerView(slots, h), tabsView(model, slots, h)]),
    ]),
  )
  .pipe(Style.attach(PageStyle))

/** What the active tab shows. A view of its own, so a test can draw it without the Tabs Submodel. */
export const TabPanel = SlotView.forMessages<Message>()
  .define(PageSlots, (model: Model, slots, h) =>
    Match.value(model.activeTab).pipe(
      Match.when('Posts', () => postsTabView(model, slots, h)),
      Match.when('Stats', () => statsTabView(model, slots, h)),
      Match.exhaustive,
    ),
  )
  .pipe(Style.attach(PageStyle))

export const view = (model: Model, h: HtmlBuilder<Message>): Document => ({
  title: 'API Cache',
  body: Page(model, h),
})

const headerView = (slots: Slots, h: HtmlBuilder<Message>): Html =>
  h.header(slots.header.attrs(), [
    h.h1(slots.title.attrs(), ['API Cache']),
    h.p(slots.lead.attrs(), [
      'Query caching, stale-while-revalidate, request deduplication and interval refetching, owned by foldkit-remote and kept in the Model.',
    ]),
  ])

const tabsView = (model: Model, slots: Slots, h: HtmlBuilder<Message>): Html =>
  h.submodel({
    slotId: TABS_ID,
    model: model.tabs,
    view: AppTabs.view,
    viewInputs: {
      tabs: tabValues,
      selectedValue: model.activeTab,
      ariaLabel: 'API cache sections',
      toView: render => {
        const { tablist, tabs } = Tabs.resolve<Tab, undefined, Message>(render, [TabsStyle.mixin], {
          input: undefined,
          h,
        })
        return h.div(slots.section.attrs(), [
          h.div(
            tablist,
            Array.map(tabs, tabInfo =>
              h.keyed('button')(tabInfo.value, tabInfo.tab, [tabInfo.value]),
            ),
          ),
          ...Array.map(
            Array.filter(tabs, tabInfo => tabInfo.isActive),
            tabInfo => h.keyed('div')(tabInfo.value, tabInfo.panel, [TabPanel(model, h)]),
          ),
        ])
      },
    },
    toParentMessage: message => Message.GotTabsMessage({ message }),
  })

const postsTabView = (model: Model, slots: Slots, h: HtmlBuilder<Message>): Html =>
  Option.match(model.maybeSelectedPostId, {
    onNone: () => postsListView(model, slots, h),
    onSome: postId =>
      h.keyed('section')(postId, slots.section.attrs(), [postDetailView(model, postId, slots, h)]),
  })

const postsListView = (model: Model, slots: Slots, h: HtmlBuilder<Message>): Html => {
  const posts = postList.read(model)

  return h.section(slots.section.attrs(), [
    h.div(slots.toolbar.attrs(), [
      h.h2(slots.heading.attrs(), ['Posts']),
      styledButton(
        {
          style: ToolbarButtonStyle,
          onClick: Message.ClickedInvalidatePosts(),
          isDisabled: isPending(posts),
          content: [posts._tag === 'Refreshing' ? 'Refreshing...' : 'Invalidate'],
        },
        h,
      ),
    ]),
    h.p(slots.hint.attrs(), [
      'Open a post, go back, and open it again. The second visit renders instantly from the Model. Invalidate marks the list stale and refetches it while the current list stays on screen.',
    ]),
    RemoteData.render(posts, {
      loading: () => placeholderView('Loading posts...', slots, h),
      notFound: () => placeholderView('There are no posts.', slots, h),
      failed: error => errorView(error.message, Message.ClickedRetryPosts(), slots, h),
      data: (page, freshness) =>
        h.div(slots.section.attrs(), [
          ...(freshness._tag === 'Stale'
            ? [errorView(freshness.error.message, Message.ClickedRetryPosts(), slots, h)]
            : []),
          h.ul(
            slots.list.attrs(),
            Array.map(page.items, post => postListItem(model, post, slots, h)),
          ),
        ]),
    }),
  ])
}

const postListItem = (
  model: Model,
  post: Selected<typeof PostRow>,
  slots: Slots,
  h: HtmlBuilder<Message>,
): Html =>
  h.keyed('li')(post.id, slots.item.attrs(), [
    styledButton(
      {
        style: PostButtonStyle,
        onClick: Message.ClickedPost({ postId: post.id }),
        content: [
          h.div(slots.rowText.attrs(), [
            h.div(slots.rowTitle.attrs(), [post.title]),
            h.div(slots.rowExcerpt.attrs(), [post.excerpt]),
          ]),
          ...(hasData(postDetail(post.id).read(model))
            ? [h.span(slots.badge.attrs(), ['Cached'])]
            : []),
        ],
      },
      h,
    ),
  ])

const postDetailView = (
  model: Model,
  postId: string,
  slots: Slots,
  h: HtmlBuilder<Message>,
): Html => {
  const retry = Message.ClickedRetryPostDetail({ postId })

  return h.div(slots.section.attrs(), [
    styledButton(
      { style: BackButtonStyle, onClick: Message.ClickedBackToPosts(), content: ['Back to posts'] },
      h,
    ),
    RemoteData.render(postDetail(postId).read(model), {
      loading: () => placeholderView('Loading post...', slots, h),
      notFound: () => errorView(`No post found with id ${postId}`, retry, slots, h),
      failed: error => errorView(error.message, retry, slots, h),
      data: (detail, freshness) =>
        h.div(slots.section.attrs(), [
          ...(freshness._tag === 'Stale'
            ? [errorView(freshness.error.message, retry, slots, h)]
            : []),
          h.article(slots.card.attrs(), [
            h.h2(slots.cardTitle.attrs(), [detail.title]),
            h.p(slots.byline.attrs(), [`By ${detail.author}`]),
            h.p(slots.body.attrs(), [detail.body]),
            h.p(slots.footnote.attrs(), ['Future visits render instantly from the Model.']),
          ]),
        ]),
    }),
  ])
}

const statsTabView = (model: Model, slots: Slots, h: HtmlBuilder<Message>): Html => {
  const reading = stats.read(model)
  const isStatsPending = isPending(reading)

  return h.section(slots.section.attrs(), [
    h.div(slots.toolbar.attrs(), [
      h.h2(slots.heading.attrs(), ['Stats']),
      styledButton(
        {
          style: ToolbarButtonStyle,
          onClick: Message.ClickedRefreshStats(),
          isDisabled: isStatsPending,
          content: [isStatsPending ? 'Refreshing...' : 'Refresh'],
        },
        h,
      ),
    ]),
    h.p(slots.hint.attrs(), [
      'Stats refetch every 5 seconds while this tab is open. The old numbers stay on screen while the new ones load.',
    ]),
    RemoteData.render(reading, {
      loading: () => placeholderView('Loading stats...', slots, h),
      notFound: () => placeholderView('The server has no stats.', slots, h),
      failed: error => errorView(error.message, Message.ClickedRetryStats(), slots, h),
      data: (current, freshness) =>
        h.div(slots.section.attrs(), [
          ...(freshness._tag === 'Stale'
            ? [errorView(freshness.error.message, Message.ClickedRetryStats(), slots, h)]
            : []),
          h.div(slots.stats.attrs(), [
            statView('Active users', `${current.activeUsers}`, slots, h),
            statView('Requests per second', `${current.requestsPerSecond}`, slots, h),
            statView('Cache hit rate', `${current.cacheHitRatePercent}%`, slots, h),
          ]),
          h.div(slots.status.attrs(), [
            h.span(slots.updatedAt.attrs(), [`Updated at ${formatTime(current.sampledAt)}`]),
            ...(freshness._tag === 'Refreshing'
              ? [h.span(slots.refreshing.attrs(), ['Refreshing'])]
              : []),
          ]),
        ]),
    }),
  ])
}

const statView = (label: string, value: string, slots: Slots, h: HtmlBuilder<Message>): Html =>
  h.div(slots.stat.attrs(), [
    h.div(slots.statLabel.attrs(), [label]),
    h.div(slots.statValue.attrs(), [value]),
  ])

const placeholderView = (text: string, slots: Slots, h: HtmlBuilder<Message>): Html =>
  h.div(slots.placeholder.attrs(), [text])

const errorView = (
  message: string,
  retryMessage: Message,
  slots: Slots,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(slots.alert.attrs(), [
    h.p(slots.alertText.attrs(), [message]),
    styledButton({ style: RetryButtonStyle, onClick: retryMessage, content: ['Retry'] }, h),
  ])
