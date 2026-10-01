// @vitest-environment jsdom
/**
 * The pages list as drawn: a list whose read failed says so and offers to ask
 * again, rather than dead-ending. The failure is driven through `update` with
 * the Message the runtime sends for a failed query.
 */
import { expect, it } from 'vitest'
import { connectionsOf } from 'foldkit-remote'
import { Inert } from 'foldkit-mixins/testing'
import { Message, initial, sitePages, update, type Model } from '../src/apps/pageApp.js'
import { Page } from '../src/views/pagesView.js'

const step = (model: Model, message: Message): Model => update(model, message).model

/** The pages list as it stands after its query read failed. */
const failedList = (model: Model): Model => {
  const [connection] = connectionsOf(sitePages)
  if (connection === undefined) throw new Error('the pages query has a connection')
  return step(
    model,
    Message.QueryFailed({
      connection: connection.identity,
      error: {
        _tag: 'ReadFailed',
        message: 'unreachable',
      },
    }),
  )
}

it('offers to ask a failed pages list again, and the retry re-asks', () => {
  const failed = failedList(initial)
  expect(sitePages.read(failed)._tag).toBe('Failed')
  const tree = Inert.draw(Page, failed)
  expect(Inert.text(tree)).toContain('The pages could not be read.')
  expect(Inert.text(tree)).toContain('Try again')
  // The retry asks the list again: it is no longer a failure.
  const retried = step(failed, Message.RetriedList())
  expect(sitePages.read(retried)._tag).not.toBe('Failed')
})
