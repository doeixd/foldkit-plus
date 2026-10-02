import * as UiTabs from '@foldkit/ui/tabs'
import { Command, click, expect, given, inside, role, scene, text } from 'foldkit/scene'
import { describe, test } from 'vitest'

import { Message, postDetail, stats, update, view } from '../src/main.js'
import {
  cachedFirstPostModel,
  failedRead,
  loadedPostsModel,
  loadedStatsModel,
  loadingPostsModel,
} from './fixtures.js'

const resolveFocusTab = Command.resolve(UiTabs.FocusTab, UiTabs.Message.CompletedFocusTab())

const failedFirstPostModel = (() => {
  const opened = update(loadedPostsModel, Message.ClickedPost({ postId: 'first-post' })).model
  return update(opened, failedRead(opened, postDetail('first-post'), 'The connection dropped.'))
    .model
})()

describe('view', () => {
  test('posts start loading, with an Invalidate button and both tabs', () => {
    scene(
      { update, view },
      given(loadingPostsModel),
      expect(text('Loading posts...')).toExist(),
      expect(role('button', { name: 'Invalidate' })).toExist(),
      expect(role('tab', { name: 'Posts' })).toExist(),
      expect(role('tab', { name: 'Stats' })).toExist(),
    )
  })

  test('invalidating keeps the list on screen and disables the button', () => {
    scene(
      { update, view },
      given(loadedPostsModel),
      click(role('button', { name: 'Invalidate' })),
      expect(role('button', { name: 'Refreshing...' })).toBeDisabled(),
      expect(role('button', { name: /First Post/ })).toExist(),
    )
  })

  test('clicking a post with nothing cached shows it loading', () => {
    scene(
      { update, view },
      given(loadedPostsModel),
      expect(text('Cached')).not.toExist(),
      click(role('button', { name: /First Post/ })),
      Command.expectNone(),
      expect(text('Loading post...')).toExist(),
    )
  })

  test('a cached post shows the Cached badge and opens from the Model', () => {
    scene(
      { update, view },
      given(cachedFirstPostModel),
      inside(role('button', { name: /First Post/ }), expect(text('Cached')).toExist()),
      inside(role('button', { name: /Second Post/ }), expect(text('Cached')).not.toExist()),
      click(role('button', { name: /First Post/ })),
      inside(
        role('article'),
        expect(text('By Grace Hopper')).toExist(),
        expect(text('The whole body of the first fixture post.')).toExist(),
      ),
      expect(role('button', { name: 'Back to posts' })).toExist(),
    )
  })

  test('a failed post shows the error, and Retry asks again', () => {
    scene(
      { update, view },
      given(failedFirstPostModel),
      expect(text('The connection dropped.')).toExist(),
      click(role('button', { name: 'Retry' })),
      expect(text('The connection dropped.')).not.toExist(),
      expect(text('Loading post...')).toExist(),
    )
  })

  test('a failed post is not marked Cached', () => {
    scene(
      { update, view },
      given(failedFirstPostModel),
      click(role('button', { name: 'Back to posts' })),
      expect(role('button', { name: /First Post/ })).toExist(),
      expect(text('Cached')).not.toExist(),
    )
  })

  test('switching to the Stats tab shows them loading', () => {
    scene(
      { update, view },
      given(loadedPostsModel),
      click(role('tab', { name: 'Stats' })),
      resolveFocusTab,
      expect(text('Loading stats...')).toExist(),
    )
  })

  test('a failed stats refresh keeps the old numbers under the error', () => {
    const refreshing = update(loadedStatsModel, Message.ClickedRefreshStats()).model
    scene(
      { update, view },
      given(update(refreshing, failedRead(refreshing, stats, 'The server is down.')).model),
      expect(text('The server is down.')).toExist(),
      expect(text('97%')).toExist(),
      expect(role('button', { name: 'Retry' })).toExist(),
    )
  })

  test('loaded stats show every number and when they were sampled', () => {
    scene(
      { update, view },
      given(loadedStatsModel),
      expect(text('Active users')).toExist(),
      expect(text('1234')).toExist(),
      expect(text('97%')).toExist(),
      expect(text('Updated at', { exact: false })).toExist(),
      click(role('button', { name: 'Refresh' })),
      expect(text('Refreshing')).toExist(),
      expect(text('97%')).toExist(),
    )
  })
})
