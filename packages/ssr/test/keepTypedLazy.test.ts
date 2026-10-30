// @vitest-environment jsdom
/**
 * #356 inside a lazy bundle: a kept field the placement draws replays as the
 * parent's wrapped Message once the bodies load, so the bundle's own update
 * sees the text, and the field keeps its caret through the boot.
 */
import { Effect } from 'effect'
import { expect, it, vi } from 'vitest'
import { SSR } from 'foldkit-ssr'
import { body, byId, deferred, load, make, settle, template } from './lazyFixture.js'

it('replays early typing into a lazy bundle after its bodies load', async () => {
  const served = make(() => Promise.resolve(body))
  load(
    SSR.page(
      template,
      await Effect.runPromise(SSR.render(served.config, served.plan(), { buildId: 'b' })),
    ),
  )
  const text = byId('text')
  if (!(text instanceof HTMLInputElement)) throw new Error('#text is not an input')
  text.focus()
  text.value = 'abc'
  text.setSelectionRange(1, 1)

  const { load: loadBodies, release } = deferred()
  const browser = make(loadBodies)
  SSR.hydrate(browser.config, browser.plan(), { buildId: 'b' })
  await settle()
  expect(byId('echo').textContent).toBe('')

  release()
  await vi.waitFor(() => expect(byId('echo').textContent).toBe('abc'))
  expect(byId('text')).toBe(text)
  expect(text.value).toBe('abc')
  expect([text.selectionStart, text.selectionEnd]).toEqual([1, 1])
})
