// @vitest-environment jsdom
/**
 * A page that waits to boot reads its bindings before it listens: one whose
 * markers do not add up is contained, and the refusal reported, as a page
 * whose state cannot resume is.
 */
import { Effect } from 'effect'
import { Projection, Surface } from 'foldkit-surface'
import { expect, it, vi } from 'vitest'
import { Diagnostics, SSR } from 'foldkit-ssr'
import { App, Post, config, load, template } from './bindingsFixture.js'

const deferred = SSR.plan(App, {
  id: 'post-deferred',
  state: Projection.pick(App.model.id, App.model.likes, App.model.search, App.model.pressed),
  surfaces: [Surface.at(Post, undefined)],
  start: 'on-interaction',
})

it('contains a deferred page whose markers name no binding, and reports why', async () => {
  load(SSR.page(template, await Effect.runPromise(SSR.render(config, deferred, { buildId: 'b' }))))
  document.getElementById('like')?.setAttribute('data-foldkit-plus-on-click', '99')
  const collected = Diagnostics.collect()

  SSR.hydrate(config, deferred, { buildId: 'b', diagnostics: collected.report })

  await vi.waitFor(() => expect(document.body.inert).toBe(true))
  expect(collected.reported).toEqual([
    expect.objectContaining({
      _tag: 'PageContained',
      level: 'error',
      reason: 'Invalid',
      message: expect.stringContaining('names no binding the page carries'),
    }),
  ])
})
