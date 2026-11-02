// @vitest-environment jsdom
/**
 * `SSR.hydrate`'s `prepare` (#347): what only the browser adds to the resumed
 * Model, such as an outbox's session, is in the Model the runtime starts
 * from, and the runtime starts only once it has run.
 */
import { Effect } from 'effect'
import { expect, it, vi } from 'vitest'
import { SSR } from 'foldkit-ssr'
import { Message, config, load, plan, settle, template, type Model } from './handoverFixture.js'

/** The fixture, whose click shows whether the Model it started from was prepared. */
const telling = {
  ...config,
  update: (model: Model, message: Message) =>
    Message.match(message, {
      Clicked: () => ({ model: { ...model, count: model.report === 'minted' ? 100 : -100 } }),
      Booted: () => ({ model }),
    }),
}

const minted = (model: Model) => Effect.succeed({ ...model, report: 'minted' })

const served = async () =>
  load(SSR.page(template, await Effect.runPromise(SSR.render(telling, plan, { buildId: 'b' }))))

const click = () => document.getElementById('count')?.click()
const count = () => document.getElementById('count')?.textContent

it('starts the runtime from the prepared Model, adopting the served page', async () => {
  await served()
  SSR.hydrate(telling, plan, { buildId: 'b', prepare: minted })
  // `report` is not drawn, so the first view is the served page.
  await vi.waitFor(() => expect(document.querySelector('[data-foldkit-build]')).toBeNull())
  expect(count()).toBe('41')

  click()
  await vi.waitFor(() => expect(count()).toBe('100'))
})

it('waits for a prepare that answers later before anything is adopted', async () => {
  await served()
  let answer = () => {}
  const later = (model: Model) =>
    Effect.callback<Model>(resume => {
      answer = () => resume(minted(model))
    })
  SSR.hydrate(telling, plan, { buildId: 'b', prepare: later })
  await settle()
  expect(document.querySelector('[data-foldkit-build]')).not.toBeNull()

  answer()
  await vi.waitFor(() => expect(document.querySelector('[data-foldkit-build]')).toBeNull())
  click()
  await vi.waitFor(() => expect(count()).toBe('100'))
})
