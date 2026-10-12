/**
 * §33.9: the tree is one declaration of both directions and of every
 * address. `Site.parse` and `Site.hrefOf` invert each other over the routes
 * the tree holds, and `Site.targets` lists a node with no params once and a
 * node with params by what its `paths` say, refusing a node left unsaid.
 */
import { Effect, Option, Schema, pipe } from 'effect'
import { defineRouteUnion, literal, mapTo, root, slash, string } from 'foldkit/route'
import { fromString } from 'foldkit/url'
import { describe, expect, it } from 'vitest'
import { Site } from '../src/index.js'

const AppRoute = defineRouteUnion({
  Home: {},
  Blog: {},
  Post: { slug: Schema.String },
  Page: { slug: Schema.String },
  NotFound: { path: Schema.String },
})

const Home = Site.route(pipe(root, mapTo(AppRoute.Home)), AppRoute.Home)
const Blog = Site.route(pipe(literal('blog'), mapTo(AppRoute.Blog)), AppRoute.Blog)
const Post = Site.route(
  pipe(literal('blog'), slash(string('slug')), mapTo(AppRoute.Post)),
  AppRoute.Post,
)
// Takes any one segment, `blog` too, so it comes after Blog in the tree.
const Page = Site.route(pipe(string('slug'), mapTo(AppRoute.Page)), AppRoute.Page)
const AppSite = Site.make(Home, Site.mount(Blog, [Post]), Page)

const urlOf = (path: string) => {
  const url = fromString(`https://example.test${path}`)
  if (Option.isNone(url)) throw new Error(`not a url: ${path}`)
  return url.value
}
const parse = Site.parse(AppSite, AppRoute.NotFound)

describe('Site.parse and Site.hrefOf', () => {
  it('parse what they build, in tree order', () => {
    for (const route of [
      AppRoute.Home(),
      AppRoute.Blog(),
      AppRoute.Post({ slug: 'first' }),
      AppRoute.Page({ slug: 'about' }),
    ]) {
      const href = Site.hrefOf(AppSite, route)
      expect(parse(urlOf(href))).toEqual(route)
    }
    expect(Site.hrefOf(AppSite, AppRoute.Post({ slug: 'first' }))).toBe('/blog/first')
    // Blog is tried before Page, which would take `blog` as a slug.
    expect(parse(urlOf('/blog'))).toEqual(AppRoute.Blog())
    expect(parse(urlOf('/a/b/c'))).toEqual(AppRoute.NotFound({ path: '/a/b/c' }))
  })
})

describe('Site.targets', () => {
  const posts = Site.paths(
    Post,
    Effect.succeed([
      { params: { slug: 'first' }, modified: '2026-10-01' },
      { params: { slug: 'second' } },
    ]),
  )
  const pages = Site.paths(Page, Effect.succeed([{ params: { slug: 'about' } }]))

  it('lists every address in tree order, with when it last changed', async () => {
    const listed = await Effect.runPromise(Site.targets(AppSite, [pages, posts]))
    expect(listed.map(({ url, modified }) => ({ url, modified }))).toEqual([
      { url: '/', modified: undefined },
      { url: '/blog', modified: undefined },
      { url: '/blog/first', modified: '2026-10-01' },
      { url: '/blog/second', modified: undefined },
      { url: '/about', modified: undefined },
    ])
    expect(listed[2]).toMatchObject({ node: Post, route: AppRoute.Post({ slug: 'first' }) })
  })

  it('fails as its paths fail', async () => {
    const failing = Site.paths(Post, Effect.fail('down' as const))
    const exit = await Effect.runPromise(Effect.flip(Site.targets(AppSite, [failing, pages])))
    expect(exit).toBe('down')
  })

  it('refuses a node with params left unsaid, and paths for a stranger or twice', () => {
    expect(() => Site.targets(AppSite, [posts])).toThrow('"Page" take params and have no paths')
    expect(() => Site.targets(Site.make(Home), [posts])).toThrow(
      '"Post" has paths but is not in the tree',
    )
    expect(() => Site.targets(AppSite, [posts, pages, posts])).toThrow('"Post" has paths twice')
    // Listing none is said, not left out.
    expect(() => Site.targets(AppSite, [posts, Site.paths(Page, Effect.succeed([]))])).not.toThrow()
  })
})
