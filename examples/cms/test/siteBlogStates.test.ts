/**
 * The blog's index in the states a read can be in before it lists posts: busy
 * before and while it is asked, an alert once it failed. The failure is driven
 * through `update` with the Message the runtime sends for a failed query.
 */
import { Option } from 'effect'
import { describe, expect, it } from 'vitest'
import { SlotView } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { connectionsOf } from 'foldkit-remote'
import { Message, blogRead, update, type Model } from '../src/apps/siteApp.js'
import { view } from '../src/views/siteView.js'
import { readSite } from './siteFixture.js'

const draw = (model: Model) => view(model, SlotView.inertBuilder()).body

const failedBlog = (model: Model): Model => {
  const projection = blogRead(model)
  if (Option.isNone(projection)) throw new Error('the blog route has a read')
  const [connection] = connectionsOf(projection.value)
  if (connection === undefined) throw new Error('the blog query has a connection')
  return update(
    model,
    Message.QueryFailed({
      connection: connection.identity,
      error: { _tag: 'ReadFailed', message: 'unreachable' },
    }),
  ).model
}

describe('the blog index before it lists posts', () => {
  it('is busy before any read is asked', async () => {
    const body = draw(await readSite('/site/blog', 'none'))
    expect(Inert.text(body)).toContain('Loading…')
    expect(Inert.byRole(body, 'alert')).toHaveLength(0)
  })

  it('is an alert, never busy, once the read failed', async () => {
    const model = failedBlog(await readSite('/site/blog', 'none'))
    const read = Option.getOrThrow(blogRead(model)).read(model)
    expect(read._tag).toBe('Failed')
    const body = draw(model)
    expect(Inert.text(body)).toContain('This could not be read.')
    expect(Inert.byRole(body, 'alert')).toHaveLength(1)
    expect(Inert.text(body)).not.toContain('Loading…')
  })
})
