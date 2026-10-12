// @vitest-environment jsdom
/**
 * What pointing at a link in the studio reads ahead: what the section there
 * will read, into that section's Model while it is still hidden, so a switch
 * draws at once. A link the chair cannot follow in this document reads
 * nothing.
 */
import { Effect, Option } from 'effect'
import type { Url } from 'foldkit/url'
import { expect, it } from 'vitest'
import { sitePages } from '../src/apps/pageApp.js'
import { Message, init, update, type Model } from '../src/apps/studioApp.js'
import { chairHarness, openBackend } from '../src/demo/harness.js'
import type { Principal } from '../src/server/server.js'

const edda: Principal = Option.some({ name: 'edda', role: 'editor' })

const urlOf = (pathname: string, search = ''): Url => ({
  protocol: 'http:',
  host: 'studio',
  port: Option.none(),
  pathname,
  search: search === '' ? Option.none() : Option.some(search),
  hash: Option.none(),
})

const onPosts = async () => {
  const { backend } = openBackend()
  await backend.seed()
  return chairHarness({
    backend,
    principal: edda,
    initial: init(urlOf('/', 'as=edda')).model,
    update,
    ticked: Message.Ticked(),
    // Only the Commands `update` asks for run here: nothing is on screen to look at.
    actives: {},
    prefetch: (model: Model) => Effect.succeed(model),
    runCommand: (effect, client) => Effect.runPromise(effect.pipe(Effect.provide(client))),
  })
}

it('reads the pages section ahead while the posts are shown', async () => {
  const studio = await onPosts()
  expect(sitePages.read(studio.model().pages)._tag).toBe('Initial')
  await studio.send(Message.PointedAtLink({ url: urlOf('/pages', 'as=edda') }))
  const after = studio.model()
  expect(after.section).toBe('posts')
  const pages = sitePages.read(after.pages)
  expect(pages._tag).toBe('Ready')
  if (pages._tag === 'Ready') expect(pages.value.items.length).toBeGreaterThan(0)
})

it.each([
  ['another chair', urlOf('/pages', 'as=wren')],
  ['another application', urlOf('/site')],
])('reads nothing for a link to %s', async (_, url) => {
  const studio = await onPosts()
  const before = studio.model()
  expect(update(before, Message.PointedAtLink({ url }))).toEqual({ model: before })
})
