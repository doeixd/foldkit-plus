// @vitest-environment jsdom
/** Phase S3: what a page says of itself, from the Model, on the server and on navigation. */
import { Effect, Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import type { Url } from 'foldkit/url'
import { Projection, Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { META_ATTRIBUTE, SSR, metaMarkup } from 'foldkit-ssr'
import { load, settle, template } from './handoverFixture.js'

const Model = Schema.Struct({ path: Schema.String, secret: Schema.String })
type Model = typeof Model.Type
const Message = defineMessageUnion({ Requested: {}, Changed: { path: Schema.String } })
type Message = typeof Message.Type
const App = Surface.application({
  Model,
  Message,
  initial: { path: '/', secret: '' },
  update: (model: Model) => ({ model }),
})

const config = {
  Model,
  routing: {
    onUrlRequest: () => Message.Requested(),
    onUrlChange: (url: Url) => Message.Changed({ path: url.pathname }),
  },
  init: (url: Url) => ({ model: { path: url.pathname, secret: 'server only' } }),
  update: (model: Model, message: Message) =>
    message._tag === 'Changed' ? { model: { ...model, path: message.path } } : { model },
  view: (model: Model, h: HtmlBuilder<Message>) => ({
    title: 'Pages',
    canonical: `https://example.test${model.path}`,
    body: h.p([h.Id('path')], [model.path]),
  }),
  container: null,
}

const plan = SSR.plan(App, {
  id: 'meta',
  state: Projection.pick(App.model.path),
  meta: model => ({
    description: `Say "hi" & <go> to ${model.path}`,
    type: 'article',
    jsonLd: [{ '@type': 'WebPage', name: `</script><b>${model.path}` }],
  }),
})

const withTags = template.replace(
  '</head>',
  '<link rel="canonical" href=""><meta property="og:url" content=""></head>',
)
const generate = (options: { readonly plan?: typeof plan; readonly template?: string } = {}) =>
  SSR.generate(config, options.plan ?? plan, {
    buildId: 'b',
    template: options.template ?? withTags,
    origin: 'https://example.test',
    paths: ['/about'],
  })

describe('a plan’s meta', () => {
  it('is written into the head from the Model, escaped', async () => {
    const [page] = await Effect.runPromise(generate())
    const head = page.html.slice(0, page.html.indexOf('</head>'))
    expect(head).toContain(
      `<meta ${META_ATTRIBUTE} name="description" content="Say &quot;hi&quot; &amp; &lt;go&gt; to /about">`,
    )
    expect(head).toContain(`<meta ${META_ATTRIBUTE} property="og:type" content="article">`)
    expect(head).toContain(String.raw`"name":"\u003c/script>\u003cb>/about"`)
    expect(head).not.toContain('</script><b>')
    // Foldkit filled the tags the template has.
    expect(head).toContain('<link rel="canonical" href="https://example.test/about" />')
  })

  it('writes an image with its size and words, an article with its authors and tags, and the twitter mirrors', () => {
    const tags = metaMarkup({
      title: 'A "post"',
      description: 'Why',
      image: 'https://example.test/card.png',
      imageSize: { width: 1200, height: 630 },
      imageAlt: 'The card',
      type: 'article',
      article: {
        published: '2026-11-18',
        modified: '2026-11-19',
        authors: ['Ada', 'Grace'],
        tags: ['release', 'ssr'],
      },
    }).split('\n')
    const has = (attribute: 'name' | 'property', name: string) =>
      tags
        .filter(tag => tag.includes(` ${attribute}="${name}" `))
        .map(tag => /content="([^"]*)"/.exec(tag)?.[1])
    expect(has('property', 'og:image:width')).toEqual(['1200'])
    expect(has('property', 'og:image:height')).toEqual(['630'])
    expect(has('property', 'og:image:alt')).toEqual(['The card'])
    expect(has('name', 'twitter:title')).toEqual(['A &quot;post&quot;'])
    expect(has('name', 'twitter:description')).toEqual(['Why'])
    expect(has('name', 'twitter:image')).toEqual(['https://example.test/card.png'])
    expect(has('name', 'twitter:image:alt')).toEqual(['The card'])
    expect(has('property', 'article:author')).toEqual(['Ada', 'Grace'])
    expect(has('property', 'article:tag')).toEqual(['release', 'ssr'])
  })

  it('writes none of them for a meta that gives none', () => {
    expect(metaMarkup({ description: 'Only this' })).not.toMatch(
      /og:image|twitter:(title|image)|article:/,
    )
  })

  it('is refused when it reads a field the plan does not send', async () => {
    const leaky = SSR.plan(App, {
      id: 'leaky',
      state: Projection.pick(App.model.path),
      meta: model => ({ description: model.secret }),
    })
    const refused = await Effect.runPromise(Effect.flip(generate({ plan: leaky })))
    expect(refused).toMatchObject({ _tag: 'ResumeUnsafe', reason: 'ViewDependsOnUnsentState' })
    expect(refused.message).toContain('its meta')
  })

  it('refuses a template without a tag Foldkit fills', async () => {
    const noCanonical = withTags.replace('<link rel="canonical" href="">', '')
    await expect(Effect.runPromise(generate({ template: noCanonical }))).rejects.toThrow(
      /sets canonical, and the template has no <link rel="canonical" href="">/,
    )
    const neither = template
    await expect(Effect.runPromise(generate({ template: neither }))).rejects.toThrow(
      /sets canonical and ogUrl/,
    )
  })

  it('follows the Model in the browser, replacing what the server wrote', async () => {
    const [page] = await Effect.runPromise(generate())
    window.history.replaceState(null, '', '/about')
    load(page.html)
    SSR.hydrate(config, plan, { buildId: 'b' })
    await settle()
    const descriptions = () =>
      [...document.head.querySelectorAll(`meta[${META_ATTRIBUTE}][name="description"]`)].map(
        element => element.getAttribute('content'),
      )
    expect(descriptions()).toEqual(['Say "hi" & <go> to /about'])

    window.history.pushState(null, '', '/contact')
    window.dispatchEvent(new PopStateEvent('popstate'))
    await settle()
    expect(document.getElementById('path')?.textContent).toBe('/contact')
    expect(descriptions()).toEqual(['Say "hi" & <go> to /contact'])
    expect(document.head.querySelectorAll(`script[${META_ATTRIBUTE}]`)).toHaveLength(1)
  })
})
