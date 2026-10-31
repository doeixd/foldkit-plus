// @vitest-environment jsdom
/**
 * What the server writes for the browser's script and no view draws is off
 * the page before Foldkit adopts it: the envelope, each binding's and kept
 * field's marker, each placement's slot, and a fallback form's `method` and hidden fields. Left on,
 * Foldkit's first patch, which begins by taking the root's stamp off, finds
 * markup the first render lacks and reconciles it. A click before that first
 * render is still answered from the markers (`lateCommitClick.test.ts`).
 */
import { Effect } from 'effect'
import { expect, it } from 'vitest'
import {
  BINDING_ATTRIBUTE,
  FALLBACK_FIELD,
  FOLDKIT_APP_ATTRIBUTE,
  KEEP_ATTRIBUTE,
  RESUME_ATTRIBUTE,
  SLOT_ATTRIBUTE,
  SSR,
} from 'foldkit-ssr'
import * as Fallback from './fallbackFixture.js'
import * as Kept from './keepTypedFixture.js'
import * as Lazy from './lazyFixture.js'

const changesWhileHydrating = (hydrate: () => void, watch: (record: MutationRecord) => string) => {
  const changes: Array<string> = []
  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.attributeName === FOLDKIT_APP_ATTRIBUTE) changes.push('adopted')
      const seen = watch(record)
      if (seen !== '' && !changes.includes(seen)) changes.push(seen)
    }
  })
  observer.observe(document.body, { attributes: true, childList: true, subtree: true })
  hydrate()
  return async () => {
    await new Promise(resolve => setTimeout(resolve, 50))
    observer.disconnect()
    return changes
  }
}

it('takes the envelope, the markers and the fallback out before Foldkit adopts the page', async () => {
  const served = SSR.page(
    Fallback.template,
    await Effect.runPromise(SSR.render(Fallback.config, Fallback.plan, { buildId: 'b' })),
  )
  Kept.load(served)
  const form = document.getElementById('add')!
  const hidden = form.querySelector(`input[name="${FALLBACK_FIELD}"]`)!
  const root = document.querySelector(`[${RESUME_ATTRIBUTE}]`)!
  expect(form.getAttribute('method')).toBe('post')
  expect(form.hasAttribute(`${BINDING_ATTRIBUTE}submit`)).toBe(true)

  const done = changesWhileHydrating(
    () => SSR.hydrate(Fallback.config, Fallback.plan, { buildId: 'b' }),
    record => {
      if (record.target === root && record.attributeName === RESUME_ATTRIBUTE) return 'envelope'
      if (record.target === form && record.attributeName === `${BINDING_ATTRIBUTE}submit`)
        return 'marker'
      if (record.target === form && record.attributeName === 'method') return 'method'
      if (Array.from(record.removedNodes).includes(hidden)) return 'hidden'
      return ''
    },
  )
  const changes = await done()
  // Each is gone before Foldkit's first patch starts, in whatever order.
  expect(changes.at(-1)).toBe('adopted')
  expect([...changes].sort()).toEqual(['adopted', 'envelope', 'hidden', 'marker', 'method'])
  expect(document.getElementById('add')).toBe(form)
})

it("takes a kept field's marker out before Foldkit adopts the page", async () => {
  const plan = Kept.plan()
  Kept.load(
    SSR.page(
      Kept.template,
      await Effect.runPromise(SSR.render(Kept.config, plan, { buildId: 'b' })),
    ),
  )
  const kept = document.querySelector(`[${KEEP_ATTRIBUTE}]`)!
  const done = changesWhileHydrating(
    () => SSR.hydrate(Kept.config, plan, { buildId: 'b' }),
    record => (record.target === kept && record.attributeName === KEEP_ATTRIBUTE ? 'kept' : ''),
  )
  expect(await done()).toEqual(['kept', 'adopted'])
})

it("takes a placement's slot out before Foldkit adopts the page", async () => {
  const served = Lazy.make(() => Promise.resolve(Lazy.body))
  Lazy.load(
    SSR.page(
      Lazy.template,
      await Effect.runPromise(SSR.render(served.config, served.plan(), { buildId: 'b' })),
    ),
  )
  const slot = Lazy.byId('clicker')
  expect(slot.hasAttribute(SLOT_ATTRIBUTE)).toBe(true)
  // Loaded before the page boots, so it boots at once.
  await served.Clicker.load()
  const done = changesWhileHydrating(
    () => SSR.hydrate(served.config, served.plan(), { buildId: 'b' }),
    record => (record.target === slot && record.attributeName === SLOT_ATTRIBUTE ? 'slot' : ''),
  )
  expect(await done()).toEqual(['slot', 'adopted'])
})
