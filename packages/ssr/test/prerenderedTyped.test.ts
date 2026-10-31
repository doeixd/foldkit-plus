// @vitest-environment jsdom
/**
 * #373: a page recorded for its path, opened at a query, hands the URL to the
 * application before the typing `KeepTyped` kept, and starts now though its
 * plan waits for an interaction.
 */
import { Effect, Option } from 'effect'
import type { Url } from 'foldkit/url'
import { expect, it, vi } from 'vitest'
import { SSR } from 'foldkit-ssr'
import {
  Message,
  config as typed,
  field,
  load,
  plan,
  seen,
  template,
  typeInto,
} from './keepTypedFixture.js'

const config = {
  ...typed,
  routing: {
    onUrlRequest: () => Message.Cleared(),
    onUrlChange: (url: Url) =>
      Message.ChangedQuery({
        value: Option.match(url.search, { onNone: () => '', onSome: search => search }),
      }),
  },
}

it('replays the address, then the typing, without waiting for an interaction', async () => {
  const [home] = await Effect.runPromise(
    SSR.generate(config, plan('on-interaction'), {
      buildId: 'b',
      template,
      origin: 'https://example.test',
      paths: ['/'],
    }),
  )
  window.history.replaceState(null, '', '/?q=url')
  load(home.html)
  typeInto(field('query', HTMLInputElement), 'typed')

  SSR.hydrate(config, plan('on-interaction'), { buildId: 'b' })

  await vi.waitFor(() => expect(seen).toHaveLength(2))
  expect(seen).toEqual([
    Message.ChangedQuery({ value: 'q=url' }),
    Message.ChangedQuery({ value: 'typed' }),
  ])
  await vi.waitFor(() => expect(field('echo', HTMLElement).textContent).toBe('typed'))
})
