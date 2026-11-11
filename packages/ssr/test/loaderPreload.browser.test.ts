/**
 * #472: a built loader asks for the runtime's chunk as it starts, not when the
 * page is idle, so a press at `load` finds the fetch under way. Only the fetch
 * moves: the chunk still runs as the plan's `start` says.
 */
import { Effect } from 'effect'
import { afterEach, expect, it, vi } from 'vitest'
import { SSR } from 'foldkit-ssr'
import { load } from 'foldkit-ssr/loader'
import type { Start } from 'foldkit-ssr'
import { config, plan, template } from './checkedFixture.js'

const CHUNK = new URL('./checkedFixture.ts', import.meta.url).href

vi.mock('../src/runtimeUrl.ts', async () => ({
  UNBUILT: 'foldkit-ssr:runtime-url',
  runtimeUrl: new URL('./checkedFixture.ts', import.meta.url).href,
}))

let page: HTMLElement | undefined

const serve = async (start: Start): Promise<void> => {
  const html = SSR.page(
    template,
    await Effect.runPromise(SSR.render(config, plan(start), { buildId: 'b' })),
  )
  page = document.createElement('div')
  page.innerHTML = new DOMParser().parseFromString(html, 'text/html').body.innerHTML
  document.body.append(page)
}

const preloads = (): ReadonlyArray<HTMLLinkElement> =>
  [...document.head.querySelectorAll<HTMLLinkElement>('link[rel="modulepreload"]')].filter(
    link => link.href === CHUNK,
  )

afterEach(() => {
  page?.remove()
  page = undefined
  for (const link of preloads()) link.remove()
})

it.each(['idle', 'on-interaction'] as const)(
  'asks for the chunk as the loader starts under %s, before idle and before any intent',
  async start => {
    await serve(start)
    const runtime = vi.fn(() => new Promise<void>(() => undefined))
    // The page is already loaded, so idle is a callback that has not run yet.
    expect(document.readyState).toBe('complete')
    load({ runtime })

    expect(preloads()).toHaveLength(1)
    expect(runtime).not.toHaveBeenCalled()
  },
)
