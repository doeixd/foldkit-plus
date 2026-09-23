/**
 * Phase 4, on the server: two static regions with one id are refused, since
 * the browser keeps one snapshot per id and would adopt only one of them; and
 * a render leaves no context behind for a later one.
 */
import { Effect } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { expect, it } from 'vitest'
import { SSR } from 'foldkit-ssr'
import { config, plan, type Message, type Model } from './staticFixture.js'

it('refuses two static regions with the same id', async () => {
  const twice = {
    ...config,
    view: (model: Model, h: HtmlBuilder<Message>) => ({
      title: 'Post',
      body: h.main(
        [],
        [
          SSR.static('post-copy', ih => [ih.h1([], [model.post.title])]),
          SSR.static('post-copy', ih => [ih.p([], [model.post.body])]),
        ],
      ),
    }),
  }
  const refused = await Effect.runPromise(Effect.flip(SSR.render(twice, plan, { buildId: 'b' })))
  expect(refused).toMatchObject({ _tag: 'ResumeUnsafe', reason: 'DuplicateStaticRegion' })
  expect(refused.message).toContain('"post-copy"')
})

it('leaves no render context behind once a render ends', async () => {
  await Effect.runPromise(SSR.render(config, plan, { buildId: 'b' }))
  let rendered = false
  SSR.static('post-copy', ih => {
    rendered = true
    return [ih.p([], ['outside any render'])]
  })
  expect(rendered).toBe(true)
})
