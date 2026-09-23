/**
 * Phase U: the view check covers the head as well as the body. Since Foldkit
 * 0.163 nothing gives `canonical` a default from the URL, so a head field is
 * whatever the view reads, and one read from a field the plan leaves out
 * would change in the browser.
 */
import { Effect } from 'effect'
import type { HtmlBuilder, TextDirection } from 'foldkit/html'
import { describe, expect, it } from 'vitest'
import { SSR } from 'foldkit-ssr'
import { config, plan, type Message, type Model } from './handoverFixture.js'

/** The head fields a view returns beside its body. */
type Head = {
  readonly title?: string
  readonly lang?: string
  readonly dir?: TextDirection
  readonly canonical?: string
}

const withHead = (head: (model: Model) => Head) => ({
  ...config,
  view: (model: Model, h: HtmlBuilder<Message>) => ({
    title: 'Counter',
    ...head(model),
    body: h.button([h.Id('count')], [String(model.count)]),
  }),
})

const refusal = (head: (model: Model) => Head) =>
  Effect.runPromise(Effect.flip(SSR.render(withHead(head), plan, { buildId: 'b' })))

describe('the view check compares the head', () => {
  it('refuses a title read from a field the plan leaves out', async () => {
    const refused = await refusal(model => ({ title: model.report }))
    expect(refused).toMatchObject({ _tag: 'ResumeUnsafe', reason: 'ViewDependsOnUnsentState' })
    expect(refused.message).toContain('the view differs in its title when rendered')
  })

  it('refuses a canonical URL read from a field the plan leaves out', async () => {
    const refused = await refusal(model => ({
      canonical: `https://example.test/${model.report.length}`,
    }))
    // With no `ogUrl` of its own, the page's follows its canonical URL.
    expect(refused.message).toContain('the view differs in its canonical, ogUrl when rendered')
  })

  it('refuses a language and direction read from a field the plan leaves out', async () => {
    const refused = await refusal(model =>
      model.report === '' ? { lang: 'en', dir: 'Ltr' } : { lang: 'ar', dir: 'Rtl' },
    )
    expect(refused.message).toContain('the view differs in its lang, dir when rendered')
  })

  it('renders a head read from what the plan sends', async () => {
    const result = await Effect.runPromise(
      SSR.render(
        withHead(model => ({
          title: `Count ${model.count}`,
          canonical: `https://example.test/${model.count}`,
        })),
        plan,
        { buildId: 'b' },
      ),
    )
    expect(result.rendered.title).toBe('Count 41')
    expect(result.rendered.canonical).toBe('https://example.test/41')
  })
})
