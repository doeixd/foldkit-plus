// @vitest-environment jsdom
/**
 * Phase 4: a static region the browser asks for that is not in the server's
 * page is reported, once, and rendered in the browser rather than left empty.
 */
import { Effect } from 'effect'
import { expect, it, vi } from 'vitest'
import { Diagnostics, SSR } from 'foldkit-ssr'
import { calls, config, load, plan, template } from './staticFixture.js'

it('reports a region the server did not render, once, and renders it', async () => {
  load(SSR.page(template, await Effect.runPromise(SSR.render(config, plan, { buildId: 'b' }))))
  const collected = Diagnostics.collect()

  SSR.hydrate(config, plan, { buildId: 'b', diagnostics: collected.report })
  document.getElementById('more')?.click()

  await vi.waitFor(() =>
    expect(document.getElementById('extra')?.textContent).toBe('rendered in the browser'),
  )
  // A second render asks for the region again.
  document.getElementById('like')?.click()
  await vi.waitFor(() => expect(calls.extra).toBeGreaterThan(1))
  expect(collected.reported).toEqual([
    expect.objectContaining({
      _tag: 'StaticRegionMissing',
      source: 'foldkit-ssr',
      level: 'error',
      region: 'extra',
    }),
  ])
})
