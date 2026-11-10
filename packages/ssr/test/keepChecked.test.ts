// @vitest-environment jsdom
/**
 * #472: a box ticked before the script runs reaches the Model once, as the
 * field's own Message, and stays ticked; a radio the person moved off sends
 * nothing, since the browser sent it no change.
 */
import { Effect } from 'effect'
import { expect, it, vi } from 'vitest'
import { KEEP_ATTRIBUTE, SSR } from 'foldkit-ssr'
import { config, field, load, plan, seen, template } from './checkedFixture.js'

it('replays a ticked box and a picked radio once, and keeps them ticked', async () => {
  const page = await Effect.runPromise(SSR.render(config, plan(), { buildId: 'b' }))
  expect(page.rendered.html.match(new RegExp(KEEP_ATTRIBUTE, 'g'))).toHaveLength(3)
  load(SSR.page(template, page))
  const agree = field('agree', HTMLInputElement)
  const large = field('size-l', HTMLInputElement)
  const small = field('size-s', HTMLInputElement)
  // Ticked before the script, as a person would: no Message was sent.
  agree.checked = true
  large.checked = true
  seen.length = 0

  SSR.hydrate(config, plan(), { buildId: 'b' })

  await vi.waitFor(() => expect(document.getElementById('plain')?.textContent).toBe('true/l'))
  expect(seen.map(message => message._tag)).toEqual(['Toggled', 'Picked'])
  expect(agree.checked).toBe(true)
  expect(large.checked).toBe(true)
  expect(small.checked).toBe(false)
})
