// @vitest-environment jsdom
/**
 * Phase 2: Flags never cross. The server's `init` reads them once, the browser
 * starts from the Model they produced, and nothing in them that the plan does
 * not send is in the page.
 */
import { Effect } from 'effect'
import { expect, it } from 'vitest'
import { SSR } from 'foldkit-ssr'
import { load, settle, template } from './handoverFixture.js'
import { calls, config, flags, plan } from './flagsFixture.js'

it('resumes an application with Flags without sending them', async () => {
  const served = SSR.page(
    template,
    await Effect.runPromise(SSR.render(config, plan, { buildId: 'b', flags })),
  )
  expect(served).not.toContain('data-foldkit-flags')
  expect(served).not.toContain('server-only token')

  load(served)
  const theme = document.getElementById('theme')
  calls.init = 0

  SSR.hydrate(config, plan, { buildId: 'b' })
  await settle()

  expect(calls.init).toBe(0)
  expect(document.body.inert).not.toBe(true)
  expect(document.getElementById('theme')).toBe(theme)
  expect(theme?.textContent).toBe('dark')
})
