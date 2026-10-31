// @vitest-environment jsdom
/**
 * A page whose forms post their Message when no script runs is adopted as
 * the page the browser's view draws: `SSR.hydrate` takes the fallback's
 * method and hidden fields out before Foldkit adopts the page, so Foldkit's
 * first patch, which begins by taking the root's stamp off, meets no markup
 * the first render lacks and reconciles nothing.
 */
import { Effect } from 'effect'
import { expect, it } from 'vitest'
import { FALLBACK_FIELD, FOLDKIT_APP_ATTRIBUTE, SSR } from 'foldkit-ssr'
import { config, plan, template } from './fallbackFixture.js'

it('takes the fallback out of a form before Foldkit adopts the page', async () => {
  const served = SSR.page(
    template,
    await Effect.runPromise(SSR.render(config, plan, { buildId: 'b' })),
  )
  const parsed = new DOMParser().parseFromString(served, 'text/html')
  document.documentElement.innerHTML = parsed.documentElement.innerHTML
  const form = document.getElementById('add')!
  const hidden = form.querySelector(`input[name="${FALLBACK_FIELD}"]`)
  expect(form.getAttribute('method')).toBe('post')
  expect(hidden).not.toBeNull()

  const changes: Array<string> = []
  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.attributeName === FOLDKIT_APP_ATTRIBUTE) changes.push('adopted')
      if (record.target === form && record.attributeName === 'method') changes.push('method')
      if (Array.from(record.removedNodes).includes(hidden!)) changes.push('hidden')
    }
  })
  observer.observe(document.body, { attributes: true, childList: true, subtree: true })
  SSR.hydrate(config, plan, { buildId: 'b' })
  await new Promise(resolve => setTimeout(resolve, 50))
  observer.disconnect()

  expect(changes).toEqual(['method', 'hidden', 'adopted'])
  expect(document.getElementById('add')).toBe(form)
})
