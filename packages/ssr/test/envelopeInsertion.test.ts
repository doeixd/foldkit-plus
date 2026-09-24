/**
 * The envelope goes into the template exactly as it was written: no `$`
 * pattern in the Model's data is read as a replacement, a `</BODY>` in capitals
 * takes it, and a template with nowhere to put it is refused, not served
 * without it.
 */
import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'
import { SSR } from 'foldkit-ssr'
import { config, plan, template } from './bindingsFixture.js'

const withSearch = (search: string) => ({
  ...config,
  init: () => ({ model: { id: 'p1', likes: 0, search, pressed: '' } }),
})

describe('SSR.page', () => {
  it.each(['a$$b', 'a$&b', 'a$`b', "a$'b"])('keeps %s in the envelope as written', async search => {
    const result = await Effect.runPromise(SSR.render(withSearch(search), plan, { buildId: 'b' }))
    const page = SSR.page(template, result)
    expect(page).toContain(`"search":${JSON.stringify(search)}`)
    expect(page.match(/data-foldkit-plus-resume/g)).toHaveLength(1)
  })

  it('puts the envelope before a </BODY> in capitals', async () => {
    const result = await Effect.runPromise(SSR.render(config, plan, { buildId: 'b' }))
    const page = SSR.page(template.replace('</body>', '</BODY>'), result)
    expect(page).toMatch(/data-foldkit-plus-resume[^]*<\/BODY>/)
  })

  it('refuses a template with no </body> to put the envelope before', async () => {
    const result = await Effect.runPromise(SSR.render(config, plan, { buildId: 'b' }))
    expect(() => SSR.page(template.replace('</body>', ''), result)).toThrow(
      'the template has no </body> to put the resume envelope before',
    )
  })
})

describe('SSR.entry', () => {
  it('refuses a template with no </body> when it is made, not per request', () => {
    expect(() =>
      SSR.entry(config, plan, { buildId: 'b', template: template.replace('</body>', '') }),
    ).toThrow('the template has no </body> to put the resume envelope before')
  })
})
