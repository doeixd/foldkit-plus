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

/** What a read says while it has nothing to show. */
const pending = (tag: string) => (tag === 'Failed' ? 'This could not be read.' : 'Loading…')

const page = (model: Model, slots: Slots, h: HtmlBuilder<Message>): ReadonlyArray<Html> => {
  const read = pageRead(model)?.read(model)
  const document = pageDocument(model)
  if (document === undefined)
    return [
      read?._tag === 'Ready'
        ? status(slots, h, 'There is no page at this address.')
        : status(slots, h, pending(read?._tag ?? 'Loading')),
    ]
  // The site's Blocks send nothing, so they draw with a builder that sends nothing, as
  // the Builder's canvas does; their links are followed by the application's routing.
  const data = actives.blocks.projectionOf(model)?.read(model)
  return Renderer.render(SiteRenderer, document, inertHtml, data === undefined ? {} : { data })
}

const post = (model: Model, slots: Slots, h: HtmlBuilder<Message>): ReadonlyArray<Html> => {
  const read = postRead(model)?.read(model)
  const first = firstOf(read)
  if (Option.isNone(first))
    return [
      status(
        slots,
        h,
        read?._tag === 'Ready'
          ? 'There is no post at this address.'
          : pending(read?._tag ?? 'Loading'),
      ),
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
  const read = blogRead(model)?.read(model)
  return [
    h.h1(slots.heading.attrs(), ['The blog']),
    read?._tag === 'Ready' || read?._tag === 'Refreshing'
      ? read.value.items.length === 0
        ? status(slots, h, 'Nothing is published yet.')
        : postGrid(h, read.value.items)
      : status(slots, h, pending(read?._tag ?? 'Loading')),
  ]
}

const titleOf = (model: Model): string => {
  switch (model.route._tag) {
    case 'Blog':
      return 'The blog'
    case 'Post': {
      const read = postRead(model)?.read(model)
      return read?._tag === 'Ready' || read?._tag === 'Refreshing'
        ? Option.getOrElse(
            Option.map(firstOf(read), found => found.title),
            () => 'Not found',
          )
        : 'The blog'
    }
    case 'Page': {
      const read = pageRead(model)?.read(model)
      return read?._tag === 'Ready' || read?._tag === 'Refreshing'
        ? Option.getOrElse(
            Option.map(firstOf(read), found => found.title),
            () => 'Not found',
          )
        : 'Journal'
    }
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
