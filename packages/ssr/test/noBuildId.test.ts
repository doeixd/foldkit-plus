// @vitest-environment jsdom
/**
 * A client given no build id refuses the page, and says why. With
 * `@foldkit/vite-plugin` and `FOLDKIT_BUILD_ID` unset, the entry's
 * `import.meta.env.FOLDKIT_BUILD_ID` is undefined; the page used to adopt the
 * baseline Model with nothing logged (#210).
 */
import { Effect } from 'effect'
import { expect, it, vi } from 'vitest'
import { SSR } from 'foldkit-ssr'
import { calls, config, load, plan, template } from './handoverFixture.js'

it('contains a page given no build id, and logs why', async () => {
  load(SSR.page(template, await Effect.runPromise(SSR.render(config, plan, { buildId: 'b' }))))
  const decoded = vi.spyOn(plan.state, 'set')
  const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
  calls.init = 0

  // @ts-expect-error what an unset `import.meta.env.FOLDKIT_BUILD_ID`, typed `any`, hands over
  SSR.hydrate(config, plan, { buildId: undefined })
  await vi.waitFor(() => expect(document.body.inert).toBe(true))
  expect(logged).toHaveBeenCalledWith(expect.stringContaining('SSR.hydrate was given no build id'))
  expect(calls.init).toBe(0)
  expect(decoded).not.toHaveBeenCalled()
})
