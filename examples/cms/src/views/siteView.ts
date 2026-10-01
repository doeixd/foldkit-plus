/**
 * The public site's view: a header, what the address names, and a footer. A
 * page is drawn by the site's Renderer, the same views the Builder's canvas
 * uses; a post by the article below; the blog by the PostList Block's cards.
 */
import { Option } from 'effect'
import { Renderer } from 'foldkit-composition/foldkit'
import { SlotView, Style } from 'foldkit-mixins'
import { Empty, Failure, Loading } from 'foldkit-mixins-crud'
import type { Document, Html, HtmlBuilder } from 'foldkit/html'
import {
  actives,
  blogRead,
  firstOf,
  pageDocument,
  pageRead,
  pathOf,
  postRead,
  type Message,
  type Model,
} from '../apps/siteApp.js'
import { ORIGIN, SOURCE } from '../content/domain.js'
import { SiteRenderer, article, postGrid } from '../content/site.js'
import { SiteSlots, SiteStyle } from '../styles/siteStyle.js'
import type { Chair } from '../server/transport.js'

type Slots = SlotView.SlotBuilders<typeof SiteSlots, Message>

/** What the blog's index says it is: its subtitle, and its description to a search engine. */
export const BLOG_LEDE =
  'How this demo is made, one part at a time: its CMS, its page builder and the packages under them.'

/** A link on the site that keeps who is reading. */
const siteLink = (reader: Chair, path: string) =>
  reader === 'visitor' ? path : `${path}?as=${reader}`

/** A read with nothing to show: loading, failed, or, once read, missing, with a way home. */
const nothing = (
  model: Model,
  slots: Slots,
  h: HtmlBuilder<Message>,
  tag: string,
  missing: string,
  /** Where back goes: a post is missed from the blog, a page from the home page. */
  back: { readonly path: '/site' | '/site/blog'; readonly label: string },
): Html =>
  tag === 'Ready' || tag === 'NotFound'
    ? h.p(slots.status.attrs(), [
        missing,
        ' ',
        h.a([h.Href(siteLink(model.reader, back.path))], [back.label]),
      ])
    : pending(slots, h, tag)

/** What a read says before it has an answer: failed, or busy while it waits. */
const pending = (slots: Slots, h: HtmlBuilder<Message>, tag: string): Html =>
  tag === 'Failed'
    ? Failure.view(slots.status, h, 'This could not be read.')
    : Loading.view(slots.status, h, 'Loading…')

/** A route's read as its tag: each view runs on its own route, where its read is. */
const tagOf = <A extends { readonly _tag: string }>(
  read: Option.Option<{ readonly read: (model: Model) => A }>,
  model: Model,
): string =>
  Option.match(read, { onNone: () => 'Initial', onSome: shown => shown.read(model)._tag })

const page = (model: Model, slots: Slots, h: HtmlBuilder<Message>): ReadonlyArray<Html> =>
  Option.match(pageDocument(model), {
    onNone: () => [
      nothing(model, slots, h, tagOf(pageRead(model), model), 'There is no page at this address.', {
        path: '/site',
        label: 'Go to the home page',
      }),
    ],
    // The site's Blocks send nothing; their links are followed by the application's routing.
    onSome: document =>
      Renderer.render(SiteRenderer, document, h, { data: actives.blocks.data(model) }),
  })

const post = (model: Model, slots: Slots, h: HtmlBuilder<Message>): ReadonlyArray<Html> => {
  const first = Option.flatMap(postRead(model), read => firstOf(read.read(model)))
  if (Option.isNone(first))
    return [
      nothing(model, slots, h, tagOf(postRead(model), model), 'There is no post at this address.', {
        path: '/site/blog',
        label: 'Go to the blog',
      }),
    ]
  const found = first.value
  return [
    article({
      slots,
      h,
      post: found,
      publishedAt: Option.fromNullOr(found.publishedAt),
      after: [
        h.a(slots.back.attrs([h.Href(siteLink(model.reader, '/site/blog'))]), [
          '← More from the blog',
        ]),
      ],
    }),
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
    h.header(slots.masthead.attrs(), [
      h.h1(slots.heading.attrs(), ['The blog']),
      h.p(slots.lede.attrs(), [BLOG_LEDE]),
    ]),
    Option.match(posts, {
      onNone: () => pending(slots, h, tagOf(blogRead(model), model)),
      onSome: items =>
        items.length === 0
          ? Empty.view(slots.status, h, 'Nothing is published yet.')
          : postGrid(h, items),
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
        // Not a post (yet): the miss, not the index it is missed from.
        () => 'Not found',
      )
    case 'Page':
      return Option.getOrElse(
        Option.map(
          Option.flatMap(pageRead(model), read => firstOf(read.read(model))),
          found => found.title,
        ),
        // Not a page (yet): the site's name alone, not "Journal · Journal".
        () => '',
      )
  }
}

const Site = SlotView.define(SiteSlots, (model: Model, slots, h: HtmlBuilder<Message>) => {
  const here = (tag: Model['route']['_tag'], slug?: string) =>
    model.route._tag === tag &&
    (slug === undefined || ('slug' in model.route && model.route.slug === slug))
      ? [h.AriaCurrent('page')]
      : []
  // The site's sections: the header's links, and again in the footer.
  const sections = [
    { label: 'Home', path: '/site', current: here('Page', 'home') },
    { label: 'Blog', path: '/site/blog', current: [...here('Blog'), ...here('Post')] },
    { label: 'About', path: '/site/about', current: here('Page', 'about') },
  ]
  return h.div(slots.root.attrs(), [
    h.a(slots.skipLink.attrs([h.Href('#site-main')]), ['Skip to content']),
    h.header(slots.header.attrs(), [
      h.a(slots.brand.attrs([h.Href(siteLink(model.reader, '/site'))]), [
        h.span(slots.brandMark.attrs([h.AriaHidden(true)]), ['J']),
        'Journal',
      ]),
      h.nav(slots.nav.attrs([h.AriaLabel('Site')]), [
        ...sections.map(({ label, path, current }) =>
          h.a(slots.navLink.attrs([h.Href(siteLink(model.reader, path)), ...current]), [label]),
        ),
        h.a(slots.source.attrs([h.Href(SOURCE), h.Title('This demo’s code, on GitHub')]), ['Code']),
        // A visitor too: the demo is a way through both, so there is always a way back.
        h.a(
          slots.studio.attrs([h.Href(model.reader === 'visitor' ? '/' : `/?as=${model.reader}`)]),
          ['Open the studio'],
        ),
      ]),
    ]),
    h.main(
      // Focusable by the skip link alone: a keyboard arrives here, not back at
      // the bar.
      slots.main.attrs([h.Id('site-main'), h.Tabindex(-1)]),
      model.route._tag === 'Page'
        ? page(model, slots, h)
        : model.route._tag === 'Post'
          ? post(model, slots, h)
          : blog(model, slots, h),
    ),
    h.footer(slots.footer.attrs(), [
      h.span([], ['Journal · written in the studio, built with Foldkit Plus.']),
      h.nav(slots.footerNav.attrs([h.AriaLabel('Footer')]), [
        ...sections.map(({ label, path }) => h.a([h.Href(siteLink(model.reader, path))], [label])),
        h.a([h.Href(SOURCE)], ['Source on GitHub']),
      ]),
    ]),
  ])
}).pipe(Style.attach(SiteStyle))

export const view = (model: Model, h: HtmlBuilder<Message>): Document => {
  const title = titleOf(model)
  return {
    title: title === '' ? 'Journal' : `${title} · Journal`,
    // Where the page lives, whoever reads it: the address without `?as=`.
    canonical: `${ORIGIN}${pathOf(model.route)}`,
    body: Site(model, h),
  }
}
