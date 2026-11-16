/**
 * A site of two applications: `plan` is a function of the path, so each page
 * resumes with the plan of the application its config names. The sitemap and
 * robots text still list both, and a plan that throws fails the build.
 */
import { Effect, Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { Projection, Surface } from 'foldkit-surface'
import { SSR } from 'foldkit-ssr'
import { generateStaticSite } from 'foldkit-ssr/vite'
import { describe, expect, it } from 'vitest'

const Message = defineMessageUnion({ Pressed: {} })
type Message = typeof Message.Type

const application = <Fields extends Schema.Struct.Fields>(
  label: string,
  fields: Fields,
  initial: Schema.Struct<Fields>['Type'],
) => {
  const Model = Schema.Struct(fields)
  const App = Surface.application({ Model, Message, initial, update: model => ({ model }) })
  const config = {
    Model,
    init: () => ({ model: initial }),
    update: (model: typeof initial) => ({ model }),
    view: (_model: typeof initial, h: HtmlBuilder<Message>) => ({
      title: label,
      body: h.main([], [h.p([h.Id('label')], [label])]),
    }),
    container: null,
  }
  return { App, config }
}

const guide = application('guide', { page: Schema.String }, { page: '/' })
const gallery = application(
  'gallery',
  { page: Schema.String, widgets: Schema.Number },
  {
    page: '/c',
    widgets: 0,
  },
)

const planOf = (id: string, app: { readonly App: any }, state: any) =>
  SSR.plan(app.App, { id, state })

const guidePlan = planOf('guide', guide, Projection.pick(guide.App.model.page))
const galleryPlan = planOf('gallery', gallery, Projection.pick(gallery.App.model.page))

const template =
  '<!doctype html><html><head><title></title></head><body><div id="root"></div></body></html>'

const site = (plan: (path: string) => typeof guidePlan) => ({
  config: (path: string) => (path.startsWith('/components') ? gallery.config : guide.config),
  plan,
  buildId: 'test',
  origin: 'https://plans.test',
  paths: ['/', '/learn', '/components/button'],
  template,
  sitemap: true,
  robots: true,
})

describe('a plan that is a function of the path', () => {
  it('resumes each page with the plan of its own application', async () => {
    const built = await Effect.runPromise(
      generateStaticSite(
        site(path => (path.startsWith('/components') ? galleryPlan : guidePlan)) as never,
      ),
    )
    const byPath = new Map(built.pages.map(page => [page.path, page.html]))
    expect(byPath.get('/')).toContain('"plan":"guide"')
    expect(byPath.get('/learn')).toContain('"plan":"guide"')
    expect(byPath.get('/components/button')).toContain('"plan":"gallery"')
    expect(byPath.get('/components/button')).not.toContain('"plan":"guide"')
    expect(built.sitemap).toContain('<loc>https://plans.test/components/button</loc>')
    expect(built.sitemap).toContain('<loc>https://plans.test/learn</loc>')
    expect(built.robots).toContain('Sitemap: https://plans.test/sitemap.xml')
  })

  it('fails the build, naming the path, when the plan function throws', async () => {
    const failing = site(path => {
      if (path === '/learn') throw new Error('no plan here')
      return guidePlan
    })
    await expect(Effect.runPromise(generateStaticSite(failing as never))).rejects.toThrow(
      /the plan for "\/learn" failed: .*no plan here/,
    )
  })

  it('still takes one plan for every page', async () => {
    const built = await Effect.runPromise(generateStaticSite(site(() => guidePlan) as never))
    expect(built.pages.every(page => page.html.includes('"plan":"guide"'))).toBe(true)
  })
})
