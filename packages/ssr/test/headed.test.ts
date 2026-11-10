// @vitest-environment node
/**
 * `SSR.headed` moves the block `SSR.entry` put at the rendered root's end, and
 * nothing else: markers a view draws in its own text stay inert where they
 * are. The block reaches the template's own `</head>`, survives a posted
 * form's page and a kept page, and a root that cannot carry it is refused.
 */
import { Effect } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import {
  handleRequest,
  injectIntoTemplate,
  type RenderedApplication,
} from 'foldkit/experimental/server'
import { Projection, CacheStore } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { FALLBACK_FIELD, SSR } from 'foldkit-ssr'
import * as Fallback from './fallbackFixture.js'
import { App, Message, config, template, type Model } from './handoverFixture.js'

const said = SSR.plan(App, {
  id: 'counter',
  state: Projection.pick(App.model.count),
  meta: model => ({ description: `count ${model.count}` }),
})
const plain = SSR.plan(App, { id: 'counter', state: Projection.pick(App.model.count) })

/** The fixture's counter, drawn after a `<style>` holding `css`, in a `div` root. */
const styledWith = (css: string) => ({
  ...config,
  view: (model: Model, h: HtmlBuilder<Message>) => ({
    title: 'Counter',
    body: h.div(
      [],
      [
        h.style([], [css]),
        h.button([h.Id('count'), h.OnClick(Message.Clicked())], [String(model.count)]),
      ],
    ),
  }),
})

const draw = SSR.headed((application: RenderedApplication) =>
  injectIntoTemplate(template, application),
)

const documentOf = async (entry: ReturnType<typeof SSR.entry>, request?: Request) => {
  const result = await entry.renderPage(request ?? new Request('https://example.test/'))
  if (result._tag !== 'Rendered') throw new Error(`answered ${result._tag}`)
  return draw(result.application)
}

const split = (document: string) => {
  const at = document.indexOf('</head>')
  return { head: document.slice(0, at), body: document.slice(at) }
}

const FORGED = 'p{} <!--foldkit-plus-head--><img src=x onerror=alert(1)><!--/foldkit-plus-head-->'

describe('markers a view draws itself', () => {
  it('stay inert in its text, with no meta of its own', async () => {
    const { head, body } = split(
      await documentOf(SSR.entry(styledWith(FORGED), plain, { buildId: 'b' })),
    )
    expect(head).not.toContain('<img')
    expect(body).toContain(`<style>${FORGED}</style>`)
  })

  it('stay inert beside the real meta, which alone reaches the head', async () => {
    const { head, body } = split(
      await documentOf(SSR.entry(styledWith(FORGED), said, { buildId: 'b' })),
    )
    expect(head).not.toContain('<img')
    expect(head.match(/name="description"/g)).toHaveLength(1)
    expect(body).toContain(`<style>${FORGED}</style>`)
    expect(body).not.toContain('name="description"')
  })

  it('stay inert in a <style> root, whose text ends where the root does', async () => {
    const styleRoot = {
      ...config,
      view: (_model: Model, h: HtmlBuilder<Message>) => ({
        title: 't',
        body: h.style([], [FORGED]),
      }),
    }
    const { head } = split(await documentOf(SSR.entry(styleRoot, plain, { buildId: 'b' })))
    expect(head).not.toContain('<img')
  })

  it('leave a page alone when only the open marker is drawn', async () => {
    const css = 'p{} <!--foldkit-plus-head--><img src=x onerror=alert(1)>'
    const document = await documentOf(SSR.entry(styledWith(css), plain, { buildId: 'b' }))
    expect(document).toBe(
      injectIntoTemplate(
        template,
        await SSR.entry(styledWith(css), plain, { buildId: 'b' })
          .renderPage(new Request('https://example.test/'))
          .then(result => {
            if (result._tag !== 'Rendered') throw new Error('not rendered')
            return result.application
          }),
      ),
    )
  })

  it("put the meta before the template's own </head>, not one in the body", async () => {
    const { head } = split(
      await documentOf(SSR.entry(styledWith('p{}</head>'), said, { buildId: 'b' })),
    )
    expect(head).toContain('name="description"')
  })
})

it("serves a posted form's page with its meta", async () => {
  const entry = SSR.entry(Fallback.config, Fallback.said, {
    buildId: 'b',
    origins: ['https://example.test'],
  })
  const posted = new Request('https://example.test/todos', {
    method: 'POST',
    headers: { accept: 'text/html', origin: 'https://example.test' },
    body: new URLSearchParams({
      [FALLBACK_FIELD]: JSON.stringify({ _tag: 'Added', title: 'Milk' }),
    }),
  })
  const served = async (request: Request) =>
    split(
      await (
        await handleRequest(request, { renderPage: entry.renderPage, renderDocument: draw })
      ).text(),
    ).head
  const counted = (head: string) =>
    Number(/name="description" content="todos (\d+)"/.exec(head)?.[1])
  const before = counted(
    await served(new Request('https://example.test/todos', { headers: { accept: 'text/html' } })),
  )
  expect(before).toBeGreaterThanOrEqual(0)
  // The post's page says what the page reached: one todo more.
  expect(counted(await served(posted))).toBe(before + 1)
})

it('keeps a kept page with its head, drawn once', async () => {
  let drawn = 0
  const kept = SSR.keptDocuments(
    SSR.headed((application: RenderedApplication, _assets: undefined) => {
      drawn += 1
      return injectIntoTemplate(template, application)
    }),
  )
  const entry = SSR.entry(config, said, {
    buildId: 'b',
    cache: { store: CacheStore.memory(), maxAge: '5 minutes' },
  })
  const heads: Array<string> = []
  for (const _ of [1, 2]) {
    const result = await entry.renderPage(new Request('https://example.test/'))
    if (result._tag !== 'Rendered') throw new Error(`answered ${result._tag}`)
    heads.push(split(kept(result.application, undefined)).head)
  }
  expect(drawn).toBe(1)
  expect(heads.every(head => head.includes('content="count 41"'))).toBe(true)
})

describe('a root that cannot carry the meta', () => {
  it.each([
    ['table', (h: HtmlBuilder<Message>) => h.table([], [])],
    ['svg', (h: HtmlBuilder<Message>) => h.svg([], [])],
    ['textarea', (h: HtmlBuilder<Message>) => h.textarea([])],
  ])('refuses a <%s> root, naming it', async (tag, root) => {
    const failed: Array<{ readonly message: string }> = []
    const result = await SSR.entry(
      {
        ...config,
        view: (_model: Model, h: HtmlBuilder<Message>) => ({ title: 't', body: root(h) }),
      },
      said,
      { buildId: 'b', diagnostics: diagnostic => Effect.sync(() => void failed.push(diagnostic)) },
    ).renderPage(new Request('https://example.test/'))
    expect(result._tag).toBe('Responded')
    expect(failed.map(({ message }) => message).join()).toContain(`returned <${tag}>`)
  })
})
