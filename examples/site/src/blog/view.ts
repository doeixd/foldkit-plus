/**
 * The blog's pages, drawn by the build into one static region each: the index
 * and a post. The views are `SlotView`s over no Message (a post has no state),
 * so the page's script draws none of this and the browser's bundle holds none
 * of its styles.
 */
import { Option } from 'effect'
import type { Html } from 'foldkit/html'
import { SlotView, Style } from 'foldkit-mixins'

import { FEED } from './meta.js'
import type { Post } from './posts.js'
import { BlogStyle } from './style.js'

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

/** `2026-11-18` as "November 18, 2026": spelled out here, so no ICU release changes it. */
export const formatDay = (day: string): string => {
  const [year, month, date] = day.split('-')
  return `${MONTHS[Number(month) - 1]} ${Number(date)}, ${year}`
}

const minutes = (post: Post): string => `${post.minutes} min read`

export interface PostInput {
  readonly post: Post
  /** The Markdown, drawn (`render.ts`). */
  readonly body: ReadonlyArray<Html | string>
  /** The post before it in time, and the one after. */
  readonly previous: Option.Option<Post>
  readonly next: Option.Option<Post>
}

export interface IndexInput {
  readonly posts: ReadonlyArray<Post>
  readonly description: string
}

export const PostView = SlotView.forMessages<never>()
  .define(BlogStyle.slots, ({ post, body, previous, next }: PostInput, slots, h) => {
    const contents = (label: string) =>
      h.nav(
        [h.AriaLabel(label)],
        [
          h.ol(
            [],
            post.sections.map(({ id, text }) => h.li([], [h.a([h.Href(`#${id}`)], [text])])),
          ),
        ],
      )
    return h.div(slots.page.attrs(), [
      h.article(slots.article.attrs(), [
        h.header(slots.header.attrs(), [
          h.p(slots.crumb.attrs(), [h.a([h.Href('/blog')], ['Blog'])]),
          h.h1(slots.title.attrs(), [post.title]),
          h.p(slots.standfirst.attrs(), [post.description]),
          h.p(slots.meta.attrs(), [
            h.span([], [h.time([h.Datetime(post.date)], [formatDay(post.date)])]),
            ...Option.toArray(post.updated).map(day =>
              h.span([], ['Updated ', h.time([h.Datetime(day)], [formatDay(day)])]),
            ),
            h.span([h.Rel('author')], [post.author]),
            h.span([], [minutes(post)]),
          ]),
          ...(post.tags.length === 0
            ? []
            : [
                h.ul(
                  slots.tags.attrs([h.AriaLabel('Tags')]),
                  post.tags.map(tag => h.li(slots.tag.attrs(), [tag])),
                ),
              ]),
        ]),
        ...(post.sections.length === 0
          ? []
          : [
              h.details(slots.folded.attrs(), [
                h.summary([], ['On this page']),
                contents('On this page'),
              ]),
            ]),
        h.div(slots.body.attrs(), body),
        h.nav(slots.pager.attrs([h.AriaLabel('More posts')]), [
          ...Option.toArray(previous).map(each =>
            h.a(
              [h.Href(each.path), h.Class('previous'), h.Rel('prev')],
              [h.small([], ['← Previous']), each.title],
            ),
          ),
          ...Option.toArray(next).map(each =>
            h.a(
              [h.Href(each.path), h.Class('next'), h.Rel('next')],
              [h.small([], ['Next →']), each.title],
            ),
          ),
        ]),
        h.p(slots.all.attrs(), [h.a([h.Href('/blog')], ['← All posts'])]),
      ]),
      ...(post.sections.length === 0
        ? []
        : [
            h.aside(slots.contents.attrs(), [h.h2([], ['On this page']), contents('On this page')]),
          ]),
    ])
  })
  .pipe(Style.attach(BlogStyle.style))

export const IndexView = SlotView.forMessages<never>()
  .define(BlogStyle.slots, ({ posts, description }: IndexInput, slots, h) =>
    h.div(slots.page.attrs(), [
      h.div(slots.article.attrs(), [
        h.header(slots.header.attrs(), [
          h.p(slots.crumb.attrs(), ['Foldkit Plus']),
          h.h1(slots.title.attrs(), ['Blog']),
          h.p(slots.standfirst.attrs(), [description]),
          h.p(slots.feed.attrs(), [
            h.a([h.Href(FEED), h.Type('application/atom+xml')], ['Subscribe with the Atom feed']),
          ]),
        ]),
        h.ol(
          slots.posts.attrs(),
          posts.map(post =>
            h.li(
              [],
              [
                h.p(slots.postMeta.attrs(), [
                  h.span([], [h.time([h.Datetime(post.date)], [formatDay(post.date)])]),
                  h.span([], [minutes(post)]),
                ]),
                h.h2(slots.postTitle.attrs(), [h.a([h.Href(post.path)], [post.title])]),
                h.p(slots.summary.attrs(), [post.description]),
                ...(post.tags.length === 0
                  ? []
                  : [
                      h.ul(
                        slots.tags.attrs([h.AriaLabel('Tags')]),
                        post.tags.map(tag => h.li(slots.tag.attrs(), [tag])),
                      ),
                    ]),
              ],
            ),
          ),
        ),
      ]),
    ]),
  )
  .pipe(Style.attach(BlogStyle.style))
