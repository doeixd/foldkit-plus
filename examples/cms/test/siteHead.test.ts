/**
 * What each part of the site says of itself, from the Site tree: every page
 * the site's name and image, a page its own title and lead, the blog its
 * lede, a post its excerpt and article facts; and what pointing at a link
 * reads ahead, so the page there draws at once.
 */
import { Effect, Option } from 'effect'
import { Site as Sites } from 'foldkit-site'
import { fromString } from 'foldkit/url'
import { describe, expect, it } from 'vitest'
import {
  BLOG_LEDE,
  Message,
  SiteMap,
  firstOf,
  metaOf,
  postRead,
  update,
} from '../src/apps/siteApp.js'
import { ORIGIN } from '../src/content/domain.js'
import { Route } from '../src/content/siteRoutes.js'
import { readSite, siteClient } from './siteFixture.js'

const urlOf = (href: string) =>
  Option.getOrThrowWith(fromString(href), () => new Error(`not a url: ${href}`))

describe('what the site says of itself', () => {
  it('names the site and its image on every page, and the blog by its lede', async () => {
    const meta = metaOf(await readSite('/site/blog', 'route', true))
    expect(meta).toMatchObject({
      siteName: 'Journal',
      image: `${ORIGIN}/og.jpg`,
      type: 'website',
      title: 'The blog',
      description: BLOG_LEDE,
    })
    expect(meta.robots).toBeUndefined()
  })

  it('describes a post by its excerpt, as a published article at its own address', async () => {
    const meta = metaOf(await readSite('/site/blog/a-page-is-data', 'route', true))
    expect(meta).toMatchObject({ type: 'article', title: 'A page is data', siteName: 'Journal' })
    expect(meta.description).toMatch(/^This page is not HTML\./)
    expect(meta.article?.published).toMatch(/^\d{4}-/)
    expect(meta.jsonLd?.[0]).toMatchObject({
      '@type': 'BlogPosting',
      url: `${ORIGIN}${Sites.hrefOf(SiteMap, Route.Post({ slug: 'a-page-is-data' }))}`,
    })
  })

  it('describes a page by its own title and lead, the home page too', async () => {
    const about = metaOf(await readSite('/site/about', 'route', true))
    const home = metaOf(await readSite('/site', 'route', true))
    expect(about.title).not.toBe(home.title)
    for (const meta of [about, home]) {
      expect(meta.type).toBe('website')
      expect(meta.description).not.toBe('')
      expect(meta.description?.length).toBeLessThanOrEqual(160)
    }
  })

  it('says only the site of a post it does not have', async () => {
    expect(metaOf(await readSite('/site/blog/nothing-here', 'route', true))).toMatchObject({
      title: 'Journal',
      type: 'website',
    })
  })
})

describe('pointing at a link', () => {
  it('reads the page there ahead, and lands it in the Model as it is', async () => {
    const blog = await readSite('/site/blog', 'route', true)
    const pointed = update(
      blog,
      Message.PointedAtLink({ url: urlOf('http://studio/site/blog/a-page-is-data') }),
    )
    expect(pointed.model).toBe(blog)
    const [preload] = pointed.commands ?? []
    if (preload === undefined) throw new Error('no preload')
    const landed = await Effect.runPromise(
      preload.effect.pipe(Effect.provide(await siteClient(true))),
    )
    // Through `update`, as the runtime hands it: the assembly routes it to Remote.
    const there = { ...update(blog, landed).model, route: Route.Post({ slug: 'a-page-is-data' }) }
    // Arrived, the post is there already: nothing left to read.
    expect(
      Option.flatMap(postRead(there), read => firstOf(read.read(there))).pipe(
        Option.map(post => post.title),
      ),
    ).toEqual(Option.some('A page is data'))
  })

  it('reads nothing for the page it is on, or for another application', async () => {
    const blog = await readSite('/site/blog', 'route', true)
    for (const href of ['http://studio/site/blog', 'http://studio/?as=edda'])
      expect(update(blog, Message.PointedAtLink({ url: urlOf(href) }))).toEqual({ model: blog })
  })
})
