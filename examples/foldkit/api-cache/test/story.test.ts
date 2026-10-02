import * as UiTabs from '@foldkit/ui/tabs'
import { Option } from 'effect'
import { Command, given, message, model, story } from 'foldkit/story'
import { modifyFields } from 'foldkit/struct'
import { describe, expect, test } from 'vitest'

import {
  Message,
  type Model,
  postDetail,
  postList,
  stats,
  subscriptions,
  update,
} from '../src/main.js'
import { cachedFirstPostModel, failedRead, loadedPostsModel, loadedStatsModel } from './fixtures.js'

const selectedPostsTab = Message.GotTabsMessage({
  message: UiTabs.Message.SelectedTab({ index: 0, value: 'Posts' }),
})

const selectedStatsTab = Message.GotTabsMessage({
  message: UiTabs.Message.SelectedTab({ index: 1, value: 'Stats' }),
})

const resolveFocusTab = Command.resolve(UiTabs.FocusTab, UiTabs.Message.CompletedFocusTab())

/** What an active read would ask the server for, as `Entity:id[fields]`. */
const planned = (
  key: Extract<keyof typeof subscriptions, `${string}.read`>,
  current: Model,
): ReadonlyArray<string> => {
  const { requirements, queries } = subscriptions[key].modelToDependencies(current)
  return [
    ...queries.map(() => 'query'),
    ...requirements.map(
      requirement => `${requirement.entity}:${requirement.id}[${requirement.fields.join(',')}]`,
    ),
  ]
}

describe('tabs', () => {
  test('the first visit to the Stats tab makes its read active, and it asks for the stats', () => {
    story(
      update,
      given(loadedPostsModel),
      message(selectedStatsTab),
      resolveFocusTab,
      Command.expectNone(),
      model(model => {
        expect(model.activeTab).toBe('Stats')
        expect(planned('stats.read', model)).toEqual([
          'Stats:current[activeUsers,requestsPerSecond,cacheHitRatePercent,sampledAt]',
        ])
      }),
    )
  })

  test('returning to a tab with cached data asks for nothing', () => {
    story(
      update,
      given(loadedStatsModel),
      message(selectedPostsTab),
      resolveFocusTab,
      model(model => {
        expect(planned('posts.read', model)).toEqual([])
        expect(planned('stats.read', model)).toEqual([])
      }),
      message(selectedStatsTab),
      resolveFocusTab,
      model(model => {
        expect(stats.read(model)._tag).toBe('Ready')
      }),
    )
  })
})

describe('posts', () => {
  test('invalidating refetches the list while keeping the current rows on screen', () => {
    story(
      update,
      given(loadedPostsModel),
      message(Message.ClickedInvalidatePosts()),
      Command.expectNone(),
      model(model => {
        const posts = postList.read(model)
        expect(posts._tag).toBe('Refreshing')
        expect(posts._tag === 'Refreshing' && posts.value.items.map(post => post.id)).toEqual([
          'first-post',
          'second-post',
        ])
        expect(planned('posts.read', model)).toContain('query')
      }),
    )
  })

  test('opening a post asks only for the fields the list did not bring', () => {
    story(
      update,
      given(loadedPostsModel),
      message(Message.ClickedPost({ postId: 'first-post' })),
      model(model => {
        expect(model.maybeSelectedPostId).toEqual(Option.some('first-post'))
        expect(planned('post.read', model)).toEqual(['Post:first-post[author,body]'])
      }),
    )
  })

  test('a revisited post is served from the Model', () => {
    story(
      update,
      given(cachedFirstPostModel),
      message(Message.ClickedPost({ postId: 'first-post' })),
      message(Message.ClickedBackToPosts()),
      message(Message.ClickedPost({ postId: 'first-post' })),
      model(model => {
        expect(postDetail('first-post').read(model)._tag).toBe('Ready')
        expect(planned('post.read', model)).toEqual([])
      }),
    )
  })

  test('a failed post is not asked for again until Retry', () => {
    const opened = update(loadedPostsModel, Message.ClickedPost({ postId: 'first-post' })).model
    story(
      update,
      given(opened),
      message(failedRead(opened, postDetail('first-post'), 'The connection dropped.')),
      model(model => {
        expect(postDetail('first-post').read(model)).toMatchObject({
          _tag: 'Failed',
          error: { message: 'The connection dropped.' },
        })
        expect(planned('post.read', model)).toEqual([])
      }),
      message(Message.ClickedRetryPostDetail({ postId: 'first-post' })),
      model(model => {
        // A retry asks for every field the page shows, the one the list brought too.
        expect(planned('post.read', model)).toEqual(['Post:first-post[title,author,body]'])
      }),
    )
  })
})

describe('stats', () => {
  test('a failed refresh keeps the old numbers on screen with the error', () => {
    const refreshing = update(loadedStatsModel, Message.ClickedRefreshStats()).model
    story(
      update,
      given(refreshing),
      message(failedRead(refreshing, stats, 'The server is down.')),
      model(model => {
        expect(stats.read(model)).toMatchObject({
          _tag: 'Failed',
          error: { message: 'The server is down.' },
          previous: { activeUsers: 120 },
        })
      }),
    )
  })

  test('refresh clicks while stats are already refreshing change nothing', () => {
    const refreshing = update(loadedStatsModel, Message.ClickedRefreshStats()).model
    expect(stats.read(refreshing)._tag).toBe('Refreshing')
    expect(update(refreshing, Message.ClickedRefreshStats()).model).toBe(refreshing)
  })

  test('a refresh click before the first stats arrive changes nothing', () => {
    const loading = modifyFields(loadedPostsModel, { activeTab: () => 'Stats' as const })
    expect(update(loading, Message.ClickedRefreshStats()).model).toBe(loading)
  })
})
