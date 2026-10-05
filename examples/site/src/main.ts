/**
 * The landing site: one page, a card for each published demo, rendered at
 * build time and taken over in the browser. Every link leaves the site, so the
 * only Messages are the ones routing sends.
 */
import { Effect, Equal, Schema, pipe } from 'effect'
import { Command, Route, type Runtime, type Update } from 'foldkit'
import { type Document, type Html, type HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { UrlRequest, load, pushUrl } from 'foldkit/navigation'
import { defineRouteUnion } from 'foldkit/route'
import { modifyFields } from 'foldkit/struct'
import { Url, toString as urlToString } from 'foldkit/url'
import { SlotView, Style, type SlotBuilders } from 'foldkit-mixins'
import { SSR } from 'foldkit-ssr/client'
import { Projection, Surface } from 'foldkit-surface'

import { demos, onGitHub, packageName, type Demo } from './demos.js'
import { SiteStyle } from './style.js'

// ROUTE

export const AppRoute = defineRouteUnion({
  Home: {},
  NotFound: { path: Schema.String },
})
export type AppRoute = typeof AppRoute.Type

const urlToAppRoute = Route.parseUrlWithFallback(
  pipe(Route.root, Route.mapTo(AppRoute.Home)),
  AppRoute.NotFound,
)

// MODEL

export const Model = Schema.Struct({ route: AppRoute })
export type Model = typeof Model.Type

// MESSAGE

export const Message = defineMessageUnion({
  ClickedLink: { request: UrlRequest },
  ChangedUrl: { url: Url },
  CompletedNavigateInternal: {},
  CompletedLoadExternal: {},
})
export type Message = typeof Message.Type

// INIT

export const init: Runtime.RoutingApplicationInit<Model, Message> = url => ({
  model: { route: urlToAppRoute(url) },
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
    ClickedLink: ({ request }) =>
      UrlRequest.match<UpdateReturn>(request, {
        Internal: ({ url }) => ({ model, commands: [NavigateInternal({ url: urlToString(url) })] }),
        External: ({ href }) => ({ model, commands: [LoadExternal({ href })] }),
      }),
    ChangedUrl: ({ url }) => {
      const next = urlToAppRoute(url)
      // The address already shown comes back as the same route: the same Model.
      return Equal.equals(next, model.route)
        ? { model }
        : { model: modifyFields(model, { route: () => next }) }
    },
    CompletedNavigateInternal: () => ({ model }),
    CompletedLoadExternal: () => ({ model }),
  })

// ROUTING

export const routing: Runtime.RoutingConfig<Message> = {
  onUrlRequest: request => Message.ClickedLink({ request }),
  onUrlChange: url => Message.ChangedUrl({ url }),
}

// SSR

const App = Surface.application({ Model, Message })

/** The one page the build generates. */
export const prerenderPaths = ['/'] as const

/** Only the route crosses to the browser: the cards are this module's own data. */
export const plan = SSR.plan(
  { initial: { route: AppRoute.Home() } },
  { id: 'site', state: Projection.pick(App.model.route) },
)

// VIEW

/** Where the site is served: a canonical address starts here. */
export const ORIGIN = 'https://foldkit-plus.pages.dev'

type Slots = SlotBuilders<typeof SiteStyle.slots, Message>

/**
 * A demo's card, in three parts on its row's grid (`subgrid`), so each part
 * starts where its neighbours' do: what it proves and what to try, the file to
 * read and the packages, and the way in.
 */
const card = (demo: Demo, slots: Slots, h: HtmlBuilder<Message>): Html =>
  h.li(slots.card.attrs(), [
    h.div(slots.body.attrs(), [
      h.h2(slots.cardTitle.attrs(), [h.a(slots.titleLink.attrs([h.Href(demo.url)]), [demo.title])]),
      h.p(slots.proves.attrs(), [demo.proves]),
      h.p(slots.label.attrs(), ['Try this']),
      h.ol(
        slots.steps.attrs(),
        demo.tryThis.map((step, index) =>
          h.li(slots.step.attrs(), [
            h.span(slots.stepLabel.attrs(), [`${index + 1} · ${step.title}`]),
            h.span([], [step.text]),
          ]),
        ),
      ),
    ]),
    h.div(slots.foot.attrs(), [
      h.p(slots.meta.attrs(), [
        h.span(slots.label.attrs(), ['Read first']),
        h.a(slots.path.attrs([h.Href(onGitHub(demo.readFirst))]), [demo.readFirst]),
      ]),
      h.ul(
        slots.packages.attrs([h.AriaLabel('Packages')]),
        demo.packages.map(name =>
          h.li(
            [],
            [
              h.a(slots.package.attrs([h.Href(onGitHub(`packages/${name}/README.md`))]), [
                packageName(name),
              ]),
            ],
          ),
        ),
      ),
    ]),
    h.a(slots.open.attrs([h.Href(demo.url)]), ['Open the demo']),
  ])

const home = (slots: Slots, h: HtmlBuilder<Message>): ReadonlyArray<Html> => [
  h.header(slots.header.attrs(), [
    h.p(slots.eyebrow.attrs(), ['Foldkit Plus']),
    h.h1(slots.heading.attrs([h.Id('page-title')]), ['The demos']),
    h.p(slots.lede.attrs(), [
      'Each is an example from the repository, built as static files. Those with a server run it in your browser, shared by every tab, so nothing you do leaves it. Open one, follow its steps, then read the file it names.',
    ]),
  ]),
  h.ul(
    slots.cards.attrs(),
    demos.map(demo => card(demo, slots, h)),
  ),
  h.p(slots.footer.attrs(), [
    'This page is one too: rendered at build time with foldkit-ssr and styled with foldkit-mixins. ',
    h.a(slots.link.attrs([h.Href(onGitHub('examples/site/src/main.ts'))]), ['Its source']),
    '.',
  ]),
]

export const Page = SlotView.forMessages<Message>()
  .define(SiteStyle.slots, (model: Model, slots, h) =>
    h.main(
      slots.page.attrs(),
      AppRoute.match(model.route, {
        Home: () => home(slots, h),
        NotFound: ({ path }) => [
          h.h1(slots.heading.attrs([h.Id('page-title')]), ['Not found']),
          h.p(slots.lede.attrs(), [
            `Nothing is at ${path}. `,
            h.a(slots.link.attrs([h.Href('/')]), ['The demos']),
            ' are on the front page.',
          ]),
        ],
      }),
    ),
  )
  .pipe(Style.attach(SiteStyle.style))

const pathOf = (route: AppRoute): string =>
  AppRoute.match(route, { Home: () => '/', NotFound: ({ path }) => path })

export const view = (model: Model, h: HtmlBuilder<Message>): Document => ({
  title: AppRoute.match(model.route, {
    Home: () => 'Foldkit Plus demos',
    NotFound: () => 'Not found · Foldkit Plus demos',
  }),
  canonical: `${ORIGIN}${pathOf(model.route)}`,
  body: Page(model, h),
})
