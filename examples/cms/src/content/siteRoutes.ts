/**
 * The public site's routes and the routers that read and build their
 * addresses: one declaration, which the Site tree (`siteApp.ts`) mounts and
 * the site's links build with, so a link and the parser cannot disagree.
 *
 *   /site             the page whose address is `home`
 *   /site/blog        the blog, newest first
 *   /site/blog/<slug> a post
 *   /site/<slug>      any other page
 */
import { Effect, Option, Schema, SchemaGetter, SchemaIssue, pipe } from 'effect'
import { defineRouteUnion, literal, mapTo, schemaSegment, slash } from 'foldkit/route'

export const Route = defineRouteUnion({
  Home: {},
  Blog: {},
  Post: { slug: Schema.String },
  Page: { slug: Schema.String },
})
export type Route = typeof Route.Type

/** The page a route shows, by its address: the home page's is `home`. */
export const pageSlugOf = (route: Route): Option.Option<string> =>
  Route.match(route, {
    Home: () => Option.some('home'),
    Page: ({ slug }) => Option.some(slug),
    Blog: () => Option.none(),
    Post: () => Option.none(),
  })

/**
 * A slug as one segment of an address: encoded when built and decoded when
 * read, which Foldkit's `string` does neither of, so a slug with a space or a
 * slash comes back as itself. An escape that does not decode is no slug.
 */
const Slug = Schema.String.pipe(
  Schema.decodeTo(Schema.String, {
    decode: SchemaGetter.transformEffect((raw: string) =>
      Effect.try({
        try: () => decodeURIComponent(raw),
        catch: () => new SchemaIssue.InvalidValue({ message: 'not an address segment' }, raw),
      }),
    ),
    encode: SchemaGetter.transform((text: string) => encodeURIComponent(text)),
  }),
)
const slug = schemaSegment('slug', Slug)
const under = literal('site')

export const homeRouter = pipe(under, mapTo(Route.Home))
export const blogRouter = pipe(under, slash(literal('blog')), mapTo(Route.Blog))
export const postRouter = pipe(under, slash(literal('blog')), slash(slug), mapTo(Route.Post))
// Takes any one segment under `/site`, `blog` too, so the tree puts it after the blog.
export const pageRouter = pipe(under, slash(slug), mapTo(Route.Page))

/** A post's address. */
export const postHref = (slug: string): string => postRouter.build({ slug })

/** A page's address: the home page's is the site's own. */
export const pageHref = (slug: string): string =>
  slug === 'home' ? homeRouter.build() : pageRouter.build({ slug })
