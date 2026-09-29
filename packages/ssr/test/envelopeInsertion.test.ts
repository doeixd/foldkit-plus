// @vitest-environment jsdom
/**
 * The envelope rides on the stamped root, beside Foldkit's own stamps:
 * `injectIntoTemplate` accepts it there and refuses it beside the root, so
 * the host owns the template and the entry never splices markup into it. No
 * `$` pattern in the Model's data is read as a replacement, and a template
 * needs no `</body>` for the envelope.
 */
import { Effect, Result } from 'effect'
import { describe, expect, it } from 'vitest'
import { SSR } from 'foldkit-ssr'
import { config, load, plan, template } from './bindingsFixture.js'

const withSearch = (search: string) => ({
  ...config,
  init: () => ({ model: { id: 'p1', likes: 0, search, pressed: '' } }),
})

/** The envelope off a served page, as the browser reads it. */
const carried = (page: string): string => {
  const found = page.match(/data-foldkit-plus-resume="([^"]*)"/)
  if (found === null) throw new Error('the page carries no envelope')
  return found[1]!.replaceAll('&quot;', '"').replaceAll('&amp;', '&')
}

describe('SSR.page', () => {
  it.each(['a$$b', 'a$&b', 'a$`b', "a$'b"])('keeps %s in the envelope as written', async search => {
    const result = await Effect.runPromise(SSR.render(withSearch(search), plan, { buildId: 'b' }))
    const page = SSR.page(template, result)
    expect(carried(page)).toContain(`"search":${JSON.stringify(search)}`)
    expect(page.match(/data-foldkit-plus-resume/g)).toHaveLength(1)
  })

  it('carries the envelope on the stamped root, as JSON', async () => {
    const result = await Effect.runPromise(SSR.render(config, plan, { buildId: 'b' }))
    expect(result.rendered.html).toMatch(/data-foldkit-app="[^"]*" data-foldkit-plus-resume="/)
    expect(carried(result.rendered.html)).toBe(result.envelope)
    const page = SSR.page(template, result)
    expect(page.match(/data-foldkit-plus-resume/g)).toHaveLength(1)
  })

  it('round-trips a hostile Model through the page the host injects', async () => {
    const hostile = `</script><script>alert(1)</script>"quoted"&quot;&#65;`
    const result = await Effect.runPromise(SSR.render(withSearch(hostile), plan, { buildId: 'b' }))
    load(SSR.page(template, result))
    expect(SSR.resume(plan, document)).toEqual(
      Result.succeed({ id: 'p1', likes: 0, search: hostile, pressed: '' }),
    )
  })

  it('needs no </body> in the template for the envelope', async () => {
    const result = await Effect.runPromise(SSR.render(config, plan, { buildId: 'b' }))
    const page = SSR.page(template.replace('</body>', ''), result)
    expect(page).toContain('data-foldkit-plus-resume')
  })
})

describe('SSR.page with a head', () => {
  it('puts what `head` returns before </head>, given what was rendered', async () => {
    const result = await Effect.runPromise(SSR.render(config, plan, { buildId: 'b' }))
    const page = SSR.page(template, result, {
      head: rendered => `<style id="used">${rendered.html.length}</style>`,
    })
    expect(page).toMatch(/<style id="used">\d+<\/style><\/head>/)
  })

  it('refuses a template with no </head> only when there is a head to put in it', async () => {
    const result = await Effect.runPromise(SSR.render(config, plan, { buildId: 'b' }))
    const headless = template.replace('</head>', '')
    expect(() => SSR.page(headless, result, { head: () => '<style></style>' })).toThrow(
      'the template has no </head> to put the head in',
    )
    expect(SSR.page(headless, result, { head: () => '' })).toBe(SSR.page(headless, result))
  })
})
