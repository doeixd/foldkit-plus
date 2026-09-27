// @vitest-environment jsdom
/**
 * Phase G2, rule 6: a placement's input and click under a lazy bundle whose
 * bodies are still loading, with a closure's press between them, reach the
 * Model the eager page reaches. While the bodies load the page keeps
 * answering from its markers, and the press only the live page can answer is
 * dispatched again once it has booted.
 */
import { expect, it } from 'vitest'
import { Action, equivalence } from './equivalence.js'
import { body, make, template } from './lazyFixture.js'

it('reaches the eager Model for a placement under a lazy bundle still loading', async () => {
  // A lazy bundle loads once, so the browser's must be another instance.
  const server = make(async () => body)
  const browser = make(async () => body)
  const { eager, resumed } = await equivalence({
    config: server.config,
    browser: browser.config,
    plan: server.plan('on-interaction'),
    template,
    pace: 'burst',
    actions: [
      Action.type('text', 'ok'),
      Action.click('count'),
      Action.pointerdown('press'),
      Action.click('title'),
    ],
  })
  expect(eager).toMatchObject({
    title: 'Titled',
    clicker: { count: 1, pressed: 2, text: 'ok' },
  })
  expect(resumed).toEqual(eager)
})
