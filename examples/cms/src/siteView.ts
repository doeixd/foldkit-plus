/**
 * The public site's view: a header, what the address names, and a footer. A
 * page is drawn by the site's Renderer, the same views the Builder's canvas
 * uses; a post by the article below; the blog by the PostList Block's cards.
 */
import { Option } from 'effect'
import { Renderer } from 'foldkit-composition/foldkit'
import { SlotView, Style } from 'foldkit-mixins'
import { inertHtml, type Document, type Html, type HtmlBuilder } from 'foldkit/html'
import {
  actives,
  blogRead,
  firstOf,
  pageDocument,
  pageRead,
  postRead,
  type Message,
  type Model,
} from './siteApp.js'
import { SiteRenderer, coverOf, dateOf, paragraphs, postGrid } from './site.js'
import { SiteSlots, SiteStyle } from './style.js'
import { chairOf } from './transport.js'

type Slots = SlotView.SlotBuilders<typeof SiteSlots, Message>

/** Who is reading. The site defaults to a visitor: an author says so in the address. */
const reader = chairOf(window.location.search, 'visitor')
/** A link on the site that keeps who is reading. */
const siteLink = (path: string) => (reader === 'visitor' ? path : `${path}?as=${reader}`)

const status = (slots: Slots, h: HtmlBuilder<Message>, text: string): Html =>
  h.p(slots.status.attrs(), [text])

/** What a read says while it has nothing to show: not found once it is read. */
const pending = (tag: string, missing: string) =>
  tag === 'Ready' ? missing : tag === 'Failed' ? 'This could not be read.' : 'Loading…'

/** A route's read as its tag: each view runs on its own route, where its read is. */
const tagOf = <A extends { readonly _tag: string }>(
  read: Option.Option<{ readonly read: (model: Model) => A }>,
  model: Model,
): string =>
  Option.match(read, { onNone: () => 'Initial', onSome: shown => shown.read(model)._tag })

const page = (model: Model, slots: Slots, h: HtmlBuilder<Message>): ReadonlyArray<Html> =>
  Option.match(pageDocument(model), {
    onNone: () => [
      status(slots, h, pending(tagOf(pageRead(model), model), 'There is no page at this address.')),
    ],
    // The site's Blocks send nothing, so they draw with a builder that sends nothing, as
    // the Builder's canvas does; their links are followed by the application's routing.
    onSome: document =>
      Renderer.render(SiteRenderer, document, inertHtml, { data: actives.blocks.data(model) }),
  })

const post = (model: Model, slots: Slots, h: HtmlBuilder<Message>): ReadonlyArray<Html> => {
  const first = Option.flatMap(postRead(model), read => firstOf(read.read(model)))
  if (Option.isNone(first))
    return [
      status(slots, h, pending(tagOf(postRead(model), model), 'There is no post at this address.')),
    ]
  const found = first.value
  return [
    h.article(slots.article.attrs(), [
      h.a(slots.back.attrs([h.Href(siteLink('/site/blog'))]), ['← The blog']),
      h.h1(slots.title.attrs(), [found.title]),
      h.p(slots.meta.attrs(), [dateOf(Option.fromNullOr(found.publishedAt))]),
      h.div(slots.cover.attrs([h.Style({ background: coverOf(found) })]), []),
      h.div(
        slots.body.attrs(),
        paragraphs(found.body).map(paragraph => h.p([], [paragraph])),
      ),
    ]),
  ]
}

const blog = (model: Model, slots: Slots, h: HtmlBuilder<Message>): ReadonlyArray<Html> => {
  const posts = Option.flatMap(blogRead(model), projection => {
    const read = projection.read(model)
    return read._tag === 'Ready' || read._tag === 'Refreshing'
      ? Option.some(read.value.items)
      : Option.none()
  })
  return [
    h.h1(slots.heading.attrs(), ['The blog']),
    Option.match(posts, {
      onNone: () => status(slots, h, pending(tagOf(blogRead(model), model), '')),
      onSome: items =>
        items.length === 0 ? status(slots, h, 'Nothing is published yet.') : postGrid(h, items),
    }),
  ]
}

const titleOf = (model: Model): string => {
  switch (model.route._tag) {
    case 'Blog':
      return 'The blog'
    case 'Post':
      return Option.getOrElse(
        Option.map(
          Option.flatMap(postRead(model), read => firstOf(read.read(model))),
          found => found.title,
        ),
        () => 'The blog',
      )
    case 'Page':
      return Option.getOrElse(
        Option.map(
          Option.flatMap(pageRead(model), read => firstOf(read.read(model))),
          found => found.title,
        ),
        () => 'Journal',
      )
  }
}

const Site = SlotView.define(SiteSlots, (model: Model, slots, h: HtmlBuilder<Message>) => {
  const here = (tag: Model['route']['_tag'], slug?: string) =>
    model.route._tag === tag &&
    (slug === undefined || ('slug' in model.route && model.route.slug === slug))
      ? [h.AriaCurrent('page')]
      : []
  return h.div(slots.root.attrs(), [
    h.header(slots.header.attrs(), [
      h.a(slots.brand.attrs([h.Href(siteLink('/site'))]), ['Journal']),
      h.nav(slots.nav.attrs([h.AriaLabel('Site')]), [
        h.a(slots.navLink.attrs([h.Href(siteLink('/site')), ...here('Page', 'home')]), ['Home']),
        h.a(
          slots.navLink.attrs([h.Href(siteLink('/site/blog')), ...here('Blog'), ...here('Post')]),
          ['Blog'],
        ),
        h.a(slots.navLink.attrs([h.Href(siteLink('/site/about')), ...here('Page', 'about')]), [
          'About',
        ]),
        ...(reader === 'visitor'
          ? []
          : [h.a(slots.navLink.attrs([h.Href(`/?as=${reader}`)]), ['Studio ↗'])]),
      ]),
    ]),
    h.main(
      slots.main.attrs(),
      model.route._tag === 'Page'
        ? page(model, slots, h)
        : model.route._tag === 'Post'
          ? post(model, slots, h)
          : blog(model, slots, h),
    ),
    h.footer(slots.footer.attrs(), ['Written in the Journal Studio, built with Foldkit Plus.']),
  ])
}).pipe(Style.attach(SiteStyle))

export const view = (model: Model, h: HtmlBuilder<Message>): Document => ({
  title: `${titleOf(model)} · Journal`,
  body: Site(model, h),
})
