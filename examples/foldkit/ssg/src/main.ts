import { Effect, Equal, Schema } from 'effect'
import { Command, type Runtime, type Update } from 'foldkit'
import { type Document, type Html, type HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { UrlRequest, load, pushUrl } from 'foldkit/navigation'
import { modifyFields } from 'foldkit/struct'
import { Url, toString as urlToString } from 'foldkit/url'
import { SlotView, Style, type SlotBuilders } from 'foldkit-mixins'
import { SSR } from 'foldkit-ssr/client'
import { Projection, Surface } from 'foldkit-surface'

import { AppRoute, aboutRouter, homeRouter, urlToAppRoute } from './route.js'
import { PageStyle } from './style.js'

export { AppRoute } from './route.js'

// MODEL

/** A post the site lists: the build reads them, the plan carries them across. */
export const Post = Schema.Struct({ slug: Schema.String, title: Schema.String })
export type Post = typeof Post.Type

export const Model = Schema.Struct({
  route: AppRoute,
  count: Schema.Number,
  posts: Schema.Array(Post),
})
export type Model = typeof Model.Type

// MESSAGE

export const Message = defineMessageUnion({
  ClickedIncrement: {},
  ClickedLink: { request: UrlRequest },
  ChangedUrl: { url: Url },
  CompletedNavigateInternal: {},
  CompletedLoadExternal: {},
})

export type Message = typeof Message.Type

// INIT

export const init: Runtime.RoutingApplicationInit<Model, Message> = url => ({
  model: { route: urlToAppRoute(url), count: 0, posts: [] },
})

// COMMAND

const NavigateInternal = Command.define('NavigateInternal', {
  args: { url: Schema.String },
  messages: [Message.CompletedNavigateInternal],
  execute: ({ url }) => pushUrl(url).pipe(Effect.as(Message.CompletedNavigateInternal())),
})

const LoadExternal = Command.define('LoadExternal', {
  args: { href: Schema.String },
  messages: [Message.CompletedLoadExternal],
  execute: ({ href }) => load(href).pipe(Effect.as(Message.CompletedLoadExternal())),
})

// UPDATE

type UpdateReturn = Update.Return<Model, Message>

export const update = (model: Model, message: Message) =>
  Message.match<UpdateReturn>(message, {
    ClickedIncrement: () => ({
      model: modifyFields(model, { count: count => count + 1 }),
    }),
    ClickedLink: ({ request }) =>
      UrlRequest.match<UpdateReturn>(request, {
        Internal: ({ url }) => ({
          model,
          commands: [NavigateInternal({ url: urlToString(url) })],
        }),
        External: ({ href }) => ({
          model,
          commands: [LoadExternal({ href })],
        }),
      }),
    ChangedUrl: ({ url }) => {
      const nextRoute = urlToAppRoute(url)

      // A link to the page already shown comes back through `pushUrl` as the
      // same route: not a change, so the same Model.
      if (Equal.equals(nextRoute, model.route)) {
        return { model }
      }

      return { model: modifyFields(model, { route: () => nextRoute }) }
    },
    CompletedNavigateInternal: () => ({ model }),
    CompletedLoadExternal: () => ({ model }),
  })

// ROUTING

/** How links become Messages, the same for the build's render and the browser. */
export const routing: Runtime.RoutingConfig<Message> = {
  onUrlRequest: request => Message.ClickedLink({ request }),
  onUrlChange: url => Message.ChangedUrl({ url }),
}

// SSR

const App = Surface.application({ Model, Message })

/**
 * The static routes the build generates: `src/site.ts` lists them for
 * `staticSite`, and the server entry names them for Foldkit's own pipeline.
 */
export const prerenderPaths = ['/', '/about'] as const

/**
 * What crosses from the build to the browser: the route and the posts. The
 * browser sets them onto `initial` and never runs `init`; the count starts at 0
 * there, as `init` starts it, and `SSR.render` refuses the page should the two
 * ever disagree.
 */
export const plan = SSR.plan(
  { initial: { route: AppRoute.Home(), count: 0, posts: [] } },
  { id: 'ssg', state: Projection.pick(App.model.route, App.model.posts) },
)

// VIEW

type Slots = SlotBuilders<typeof PageStyle.slots, Message>

const routeTitle = (route: AppRoute): string =>
  AppRoute.match(route, {
    Home: () => 'Home | Static Generation | Foldkit',
    About: () => 'About | Static Generation | Foldkit',
    NotFound: () => 'Not Found | Static Generation | Foldkit',
  })

/** Where the deployment is served: a canonical address starts here. */
export const ORIGIN = 'https://example.com'

const routePath = (route: AppRoute): string =>
  AppRoute.match(route, {
    Home: () => '/',
    About: () => '/about',
    NotFound: ({ path }) => path,
  })

const navigationView = (slots: Slots, h: HtmlBuilder<Message>): Html =>
  h.nav(slots.nav.attrs(), [
    h.a(slots.navLink.attrs([h.Href(homeRouter())]), ['Home']),
    h.a(slots.navLink.attrs([h.Href(aboutRouter())]), ['About']),
  ])

const pageView = (model: Model, slots: Slots, h: HtmlBuilder<Message>): Html =>
  AppRoute.match(model.route, {
    Home: () =>
      h.section(slots.section.attrs(), [
        h.h1(slots.heading.attrs([h.Id('page-title')]), ['Statically generated home']),
        h.p(slots.text.attrs(), [
          'This route was rendered during the build and hydrated in place.',
        ]),
        // The build prepared these from the site's posts; the plan carried them
        // to the browser, so the page draws the same list without refetching.
        h.ul(
          slots.posts.attrs(),
          model.posts.map(post => h.li(slots.post.attrs(), [post.title])),
        ),
        h.button(slots.button.attrs([h.OnClick(Message.ClickedIncrement())]), [
          `Count: ${model.count}`,
        ]),
      ]),
    About: () =>
      h.section(slots.section.attrs(), [
        h.h1(slots.heading.attrs([h.Id('page-title')]), ['Statically generated about page']),
        h.p(slots.text.attrs(), ['The same prerender produced this route in the same build.']),
      ]),
    NotFound: ({ path }) =>
      h.section(slots.section.attrs(), [
        h.h1(slots.heading.attrs([h.Id('page-title')]), ['Not found']),
        h.p(slots.text.attrs(), [`No statically generated page exists for ${path}.`]),
      ]),
  })

export const Page = SlotView.forMessages<Message>()
  .define(PageStyle.slots, (model: Model, slots, h) =>
    h.main(slots.page.attrs(), [navigationView(slots, h), pageView(model, slots, h)]),
  )
  .pipe(Style.attach(PageStyle.style))

export const view = (model: Model, h: HtmlBuilder<Message>): Document => ({
  title: routeTitle(model.route),
  // A view supplies the canonical; Foldkit fills the served `<link>` with it,
  // or keeps the document without one. `og:url` falls back to it.
  canonical: `${ORIGIN}${routePath(model.route)}`,
  body: Page(model, h),
})
