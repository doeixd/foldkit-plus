// @vitest-environment jsdom
/**
 * #470: the resume envelope leaves out the fields the search mirror owns, and
 * the browser reads them again before the first render. The cart's cookie
 * holds names only, which the server prices, so the cart still crosses.
 */
import { Option } from 'effect'
import { fromString } from 'foldkit/url'
import { SSR } from 'foldkit-ssr'
import { expect, test } from 'vitest'
import { init, plan } from '../src/client/app.js'

const url = 'https://domains.test/?q=acme&tld=com&availability=available&sort=price&from=24'

test('the envelope leaves out every field a mirror restores', () => {
  const model = init(Option.getOrThrow(fromString(url))).model
  const envelope = JSON.parse(SSR.envelope(plan, model)) as { state: Record<string, unknown> }
  expect(Object.keys(envelope.state).sort()).toEqual([
    'cart',
    'resultsList',
    'route',
    'searchLayout',
    'settledLabel',
  ])
})

test('the browser restores the mirror fields the envelope leaves out', () => {
  window.history.replaceState(
    null,
    '',
    '/?q=acme&tld=com&availability=available&sort=price&from=24',
  )
  const server = init(Option.getOrThrow(fromString(url))).model

  // What the envelope resumes: the sent state on the baseline, with the
  // restored fields still at their defaults.
  const resumed = plan.state.set(plan.baseline, plan.state.get(server))
  const restored = plan.restore?.(resumed)

  expect(restored).toMatchObject({
    query: server.query,
    tldFilter: server.tldFilter,
    availabilityFilter: server.availabilityFilter,
    sortOrder: server.sortOrder,
    from: server.from,
  })
})
