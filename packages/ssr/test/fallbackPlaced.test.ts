/**
 * A fallback form inside a placement posts the parent's Message, and the
 * fields it names sit one wrapper down; the server fills them there.
 */
import { Effect } from 'effect'
import { expect, it } from 'vitest'
import { FALLBACK_FIELD, SSR } from 'foldkit-ssr'
import { body, make } from './lazyFixture.js'

it("fills a placed form's fields inside the parent's Message", async () => {
  const { config, plan } = make(() => Promise.resolve(body))
  const posting = plan('now', 'server')
  const { rendered } = await Effect.runPromise(SSR.render(config, posting, { buildId: 'b' }))
  expect(rendered.html).toContain(
    `name="${FALLBACK_FIELD}" value="{&quot;_tag&quot;:&quot;GotClickerMessage&quot;,&quot;message&quot;:{&quot;_tag&quot;:&quot;Typed&quot;,&quot;value&quot;:&quot;&quot;}}"`,
  )
  expect(rendered.html).toContain('name="foldkit-plus-depth" value="1"')

  const form = new URLSearchParams({
    value: 'renamed',
    [FALLBACK_FIELD]: JSON.stringify({
      _tag: 'GotClickerMessage',
      message: { _tag: 'Typed', value: '' },
    }),
    'foldkit-plus-depth': '1',
  })
  const request = new Request('https://example.test/', { method: 'POST', body: form })
  const answered = await Effect.runPromise(SSR.handle(request, config, posting, { buildId: 'b' }))
  expect(answered.rendered.html).toContain('<p id="echo">renamed</p>')
})
