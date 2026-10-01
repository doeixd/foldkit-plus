// @vitest-environment jsdom
/**
 * The posts list as drawn: a list whose read failed says so and offers to ask
 * again, rather than dead-ending. The failure is driven through `update` with
 * the Message the runtime sends for a failed query.
 */
import { Option } from 'effect'
import { describe, expect, it } from 'vitest'
import { connectionsOf } from 'foldkit-remote'
import { Inert } from 'foldkit-mixins/testing'
import { initial, Message, update, Worklist, type Model } from '../src/apps/app.js'
import { Studio } from '../src/views/view.js'

const step = (model: Model, message: Message): Model => update(model, message).model

/** The worklist as it stands after its query read failed. */
const failedList = (model: Model): Model => {
  const active = Worklist.active.projectionOf(model)
  const connections = Option.isSome(active) ? connectionsOf(active.value as never) : []
  const connection = (connections[0] as { readonly identity?: string } | undefined)?.identity ?? ''
  return step(
    model,
    Message.QueryFailed({ connection, error: { _tag: 'ReadFailed', message: 'unreachable' } }),
  )
}

describe('the posts list', () => {
  it('offers to ask a failed read again, and the retry re-asks', () => {
    const failed = failedList(initial)
    expect(Worklist.page(failed)._tag).toBe('Failed')
    const tree = Inert.draw(Studio, failed)
    expect(Inert.text(tree)).toContain('Try again')
    // The retry asks the list again: it is no longer a failure.
    const retried = step(failed, Message.RetriedList())
    expect(Worklist.page(retried)._tag).not.toBe('Failed')
  })
})
