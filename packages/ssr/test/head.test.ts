// @vitest-environment jsdom
/**
 * A dynamically served page's `meta`: `SSR.entry` carries it in the rendered
 * root, the host's `SSR.headed` moves it into the head, and a host that left
 * the wrapper out is told by `SSR.hydrate`, which takes it out of the body.
 */
import { Effect } from 'effect'
import { injectIntoTemplate } from 'foldkit/experimental/server'
import { Projection } from 'foldkit-surface'
import { expect, it } from 'vitest'
import { SSR, type Diagnostic } from 'foldkit-ssr'
import { App, config, load, settle, template } from './handoverFixture.js'

const said = SSR.plan(App, {
  id: 'counter',
  state: Projection.pick(App.model.count),
  meta: model => ({ description: `count ${model.count}` }),
})

const served = async (headed: boolean, styles?: () => string) => {
  const result = await SSR.entry(config, said, {
    buildId: 'b',
    ...(styles === undefined ? {} : { styles }),
  }).renderPage(new Request('https://example.test/'))
  if (result._tag !== 'Rendered') throw new Error(`answered ${result._tag}`)
  const render = (application: typeof result.application) =>
    injectIntoTemplate(template, application)
  return headed ? SSR.headed(render)(result.application) : render(result.application)
}

/** Hydrates the page loaded, and answers what it reported. */
const hydrated = async (buildId = 'b') => {
  const reported: Array<Diagnostic> = []
  SSR.hydrate(config, said, {
    buildId,
    diagnostics: diagnostic => Effect.sync(() => void reported.push(diagnostic)),
  })
  await settle()
  return reported
}

it('serves the meta in the head with SSR.headed, and hydrates with nothing to report', async () => {
  const page = await served(true)
  load(page)
  expect(document.head.querySelector('meta[name="description"]')?.getAttribute('content')).toBe(
    'count 41',
  )
  const reported = await hydrated()
  expect(reported.map(diagnostic => diagnostic._tag)).not.toContain('HeadNotMoved')
  expect(document.getElementById('count')?.textContent).toBe('41')
})

it('reports a page whose meta was left in the body, and takes it out of the root', async () => {
  const page = await served(false)
  load(page)
  const root = document.querySelector('[data-foldkit-app]')
  expect(root?.querySelector('meta[name="description"]')).not.toBeNull()

  const reported = await hydrated()

  expect(reported).toEqual([expect.objectContaining({ _tag: 'HeadNotMoved', level: 'error' })])
  expect(root?.querySelector('meta')).toBeNull()
  expect(Array.from(root?.childNodes ?? [], node => node.nodeType)).toEqual([Node.TEXT_NODE])
  // The plan's meta entry writes the head once the page runs.
  await expect
    .poll(() => document.head.querySelector('meta[name="description"]')?.getAttribute('content'))
    .toBe('count 41')
})

it("keeps the styles' move apart from the meta, which is still reported", async () => {
  load(await served(false, () => '<style data-first-paint>p{color:red}</style>'))
  const reported = await hydrated()
  expect(reported.map(diagnostic => diagnostic._tag)).toContain('HeadNotMoved')
  expect(document.querySelector('style[data-first-paint]')?.parentNode).toBe(document.head)
  expect(document.querySelector('[data-foldkit-app] meta')).toBeNull()
})

it('refuses meta for a void root, naming the tag', async () => {
  const voided = {
    ...config,
    view: (model: { readonly count: number }, h: Parameters<typeof config.view>[1]) => ({
      title: 't',
      body: h.input([h.Id('only'), h.Value(String(model.count))]),
    }),
  }
  const failed: Array<Diagnostic> = []
  const result = await SSR.entry(voided, said, {
    buildId: 'b',
    diagnostics: diagnostic => Effect.sync(() => void failed.push(diagnostic)),
  }).renderPage(new Request('https://example.test/'))
  expect(result._tag).toBe('Responded')
  expect(failed).toEqual([
    expect.objectContaining({
      _tag: 'PageFailed',
      message: expect.stringContaining('returned <input>'),
    }),
  ])
})

it('takes the meta out of a contained page too, which nothing adopts', async () => {
  load(await served(false))
  const root = document.querySelector('[data-foldkit-app]')
  const reported = await hydrated('another build')
  expect(reported.map(diagnostic => diagnostic._tag)).toContain('HeadNotMoved')
  expect(document.body.inert).toBe(true)
  expect(Array.from(root?.childNodes ?? [], node => node.nodeType)).toEqual([Node.TEXT_NODE])
})
