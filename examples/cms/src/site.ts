/**
 * What a page may hold, and how each part looks: the site's vocabulary, in
 * code. A page stored in the database names these Blocks, holds their props,
 * and chooses among their looks (`appearance`); it never holds a view or CSS.
 *
 * Each Block's look is a `foldkit-mixins` recipe made into appearance axes by
 * `Appearance.make`: the inspector offers the axes, the Renderer draws the
 * chosen Style, and `sheet.ts` ships every rule once.
 */
import { Array as Arr, Option, Schema } from 'effect'
import { Builder } from 'foldkit-builder'
import { Cms } from 'foldkit-cms'
import { Block, Catalog, Content, Region, Url } from 'foldkit-composition'
import { Appearance } from 'foldkit-composition/appearance'
import { Renderer } from 'foldkit-composition/foldkit'
import { QueryBlock } from 'foldkit-composition/remote'
import { Entity } from 'foldkit-entity'
import { Input } from 'foldkit-form'
import { Capability, Layers, Slot, Slots, Style } from 'foldkit-mixins'
import { BuilderView } from 'foldkit-mixins-builder'
import { Layout } from 'foldkit-mixins/layout'
import { Prose } from 'foldkit-mixins/prose'
import { ButtonSlots, Recipes } from 'foldkit-mixins-ui'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { Post, PostById, PostId, RecentPosts } from './domain.js'
import { BuilderStyle, t } from './style.js'

/** The looks' base rules sit in `components`, below the application's own. */
const components = Layers.standard.layer('components')
/** Every part of a look is a container another style may dress. */
const part = Slot.make({ capability: Capability.Container })

/** Where the public site shows a post and a page. */
export const postHref = (slug: string) => `/site/blog/${slug}`
export const pageHref = (slug: string) => (slug === 'home' ? '/site' : `/site/${slug}`)

/** A picture for a post without one: a gradient from its title, so each post has its own. */
export const coverOf = (post: { readonly title: string; readonly cover: string }) => {
  if (post.cover !== '') return `center / cover no-repeat url("${post.cover.replace(/"/g, '%22')}")`
  let hue = 0
  for (const char of post.title) hue = (hue * 31 + char.charCodeAt(0)) % 360
  return `linear-gradient(135deg, oklch(70% 0.14 ${hue}), oklch(45% 0.16 ${(hue + 60) % 360}))`
}

/** The day a post went out, as a reader says it. */
export const dateOf = (at: Option.Option<string>) =>
  Option.match(at, {
    onNone: () => 'Not published',
    onSome: day =>
      new Date(day).toLocaleDateString('en', { year: 'numeric', month: 'long', day: 'numeric' }),
  })

/** Paragraphs are separated by a blank line. */
export const paragraphs = (body: string): ReadonlyArray<string> =>
  body
    .split(/\n\s*\n/)
    .map(paragraph => paragraph.trim())
    .filter(paragraph => paragraph !== '')

// --- Hero: the top of a page ------------------------------------------------------

const HeroSlots = Slots.define({
  root: part,
  eyebrow: part,
  title: part,
  lead: part,
  actions: part,
})
// On a band of its own color, headings and unfilled buttons take the band's color.
const onBand = Style.vars({ '--fk-heading': 'currentColor', '--fk-ink': 'currentColor' })
const HeroLook = Appearance.make(HeroSlots, {
  layer: components,
  recipe: Style.recipeFor(HeroSlots)({
    base: {
      root: Style.self({
        borderRadius: t.radius.xl,
        display: 'grid',
        gap: t.space.md,
        padding: `clamp(2rem, 6vw, 5rem) clamp(1.25rem, 5vw, 4rem)`,
      }),
      eyebrow: Style.self({
        fontSize: t.size.sm,
        fontWeight: t.weight.semibold,
        letterSpacing: '0.08em',
        margin: '0',
        textTransform: 'uppercase',
      }),
      title: Style.self({
        fontFamily: t.font.heading,
        fontSize: 'clamp(2.2rem, 5vw, 3.6rem)',
        letterSpacing: '-0.02em',
        lineHeight: '1.05',
        margin: '0',
        maxWidth: '18ch',
      }),
      lead: Style.self({ fontSize: t.size.lg, margin: '0', maxWidth: '52ch', opacity: '0.85' }),
      actions: Layout.cluster({ gap: t.space.sm }),
    },
    variants: {
      tone: {
        plain: { root: Style.self({ background: t.surface.muted }) },
        accent: {
          root: Style.compose(
            Style.self({
              background: `linear-gradient(135deg, ${t.accent.default}, color-mix(in oklch, ${t.accent.default} 55%, ${t.tertiary.default}))`,
              color: t.accent['on-fill'],
            }),
            onBand,
          ),
        },
        ink: {
          root: Style.compose(
            Style.self({ background: t.text.overt, color: t.surface.base }),
            onBand,
          ),
        },
      },
      align: {
        start: {},
        center: {
          root: Style.self({ justifyItems: 'center', textAlign: 'center' }),
          actions: Style.self({ justifyContent: 'center' }),
        },
      },
    },
    defaults: { tone: 'accent', align: 'start' },
  }),
})
export const Hero = Block.define('Hero', {
  Props: Schema.Struct({
    eyebrow: Schema.String.annotate({ title: 'Eyebrow' }),
    title: Schema.String.check(Schema.isMinLength(1)).annotate({ title: 'Title' }),
    lead: Schema.String.annotate({ title: 'Lead' }),
  }),
  regions: { actions: Region.many({ accepts: [Content.Interactive], max: 2 }) },
  provides: [Content.Section],
}).pipe(
  Appearance.attach(HeroLook),
  Block.annotate(BuilderView.controls({ lead: Input.multiline() })),
)

// --- Section: a band of the page --------------------------------------------------

const SectionSlots = Slots.define({ root: part, inner: part, heading: part })
const SectionLook = Appearance.make(SectionSlots, {
  layer: components,
  recipe: Style.recipeFor(SectionSlots)({
    base: {
      root: Style.self({ borderRadius: t.radius.xl, paddingBlock: t.space.xl }),
      inner: Style.compose(
        Layout.stack({ gap: t.space.lg }),
        Style.self({ marginInline: 'auto', paddingInline: t.space.lg }),
      ),
      heading: Style.self({
        fontFamily: t.font.heading,
        fontSize: t.size['2xl'],
        letterSpacing: '-0.01em',
        margin: '0',
      }),
    },
    variants: {
      tone: {
        plain: {},
        muted: { root: Style.self({ background: t.surface.muted }) },
        accent: { root: Style.self({ background: t.accent.subtle }) },
      },
      width: {
        narrow: { inner: Style.self({ maxWidth: '44rem' }) },
        wide: { inner: Style.self({ maxWidth: '72rem' }) },
      },
    },
    defaults: { tone: 'plain', width: 'wide' },
  }),
})
export const Section = Block.define('Section', {
  Props: Schema.Struct({
    heading: Schema.String.annotate({ title: 'Heading', description: 'Leave empty for none.' }),
  }),
  regions: { body: Region.many({ accepts: [Content.Flow] }) },
  provides: [Content.Section],
}).pipe(Appearance.attach(SectionLook))

// --- Columns: two columns that stack on a narrow screen ---------------------------

const ColumnsSlots = Slots.define({ root: part, left: part, right: part })
const grow = (left: string, right: string) => ({
  left: Style.inline({ flexGrow: left }),
  right: Style.inline({ flexGrow: right }),
})
const ColumnsLook = Appearance.make(ColumnsSlots, {
  layer: components,
  recipe: Style.recipeFor(ColumnsSlots)({
    base: {
      root: Layout.switcher({ threshold: '36rem', gap: t.space.lg }),
      left: Layout.stack({ gap: t.space.md }),
      right: Layout.stack({ gap: t.space.md }),
    },
    variants: {
      ratio: { '1:1': grow('1', '1'), '2:1': grow('2', '1'), '1:2': grow('1', '2') },
    },
    defaults: { ratio: '1:1' },
  }),
})
export const Columns = Block.define('Columns', {
  Props: Schema.Struct({}),
  regions: {
    left: Region.many({ accepts: [Content.Flow] }),
    right: Region.many({ accepts: [Content.Flow] }),
  },
  provides: [Content.Flow],
}).pipe(Appearance.attach(ColumnsLook))

// --- Heading and Text -------------------------------------------------------------

const HeadingSlots = Slots.define({ root: part })
const HeadingLook = Appearance.make(HeadingSlots, {
  layer: components,
  recipe: Style.recipeFor(HeadingSlots)({
    base: {
      root: Style.self({ fontFamily: t.font.heading, letterSpacing: '-0.01em', margin: '0' }),
    },
    variants: {
      size: {
        large: { root: Style.self({ fontSize: t.size['2xl'] }) },
        medium: { root: Style.self({ fontSize: t.size.xl }) },
      },
    },
    defaults: { size: 'large' },
  }),
})
export const Heading = Block.define('Heading', {
  Props: Schema.Struct({
    text: Schema.String.check(Schema.isMinLength(1)).annotate({ title: 'Text' }),
  }),
  provides: [Content.Flow],
}).pipe(Appearance.attach(HeadingLook))

const TextSlots = Slots.define({ root: part })
const TextLook = Appearance.make(TextSlots, {
  layer: components,
  recipe: Style.recipeFor(TextSlots)({
    base: {
      root: Style.compose(Prose.style({ measure: '68ch' }), Style.self({ fontSize: t.size.md })),
    },
    variants: { emphasis: { normal: {}, lead: { root: Style.self({ fontSize: t.size.lg }) } } },
    defaults: { emphasis: 'normal' },
  }),
})
export const Text = Block.define('Text', {
  Props: Schema.Struct({
    body: Schema.String.annotate({
      title: 'Text',
      description: 'Paragraphs are separated by a blank line.',
    }),
  }),
  provides: [Content.Flow],
}).pipe(
  Appearance.attach(TextLook),
  Block.annotate(BuilderView.controls({ body: Input.multiline() })),
)

// --- Image, Quote, Callout, Divider -----------------------------------------------

const ImageSlots = Slots.define({ root: part, image: part, caption: part })
const ImageLook = Appearance.make(ImageSlots, {
  layer: components,
  recipe: Style.recipeFor(ImageSlots)({
    base: {
      root: Style.self({ display: 'grid', gap: t.space.xs, margin: '0' }),
      image: Style.self({ display: 'block', height: 'auto', objectFit: 'cover', width: '100%' }),
      caption: Style.self({ color: t.text.muted, fontSize: t.size.sm }),
    },
    variants: {
      corners: {
        rounded: { image: Style.self({ borderRadius: t.radius.lg }) },
        square: {},
      },
      shape: {
        natural: {},
        wide: { image: Style.self({ aspectRatio: '21 / 9' }) },
        square: { image: Style.self({ aspectRatio: '1' }) },
      },
    },
    defaults: { corners: 'rounded', shape: 'natural' },
  }),
})
export const Image = Block.define('Image', {
  Props: Schema.Struct({
    src: Url.annotate({ title: 'Image address' }),
    alt: Schema.String.annotate({ title: 'Description', description: 'What the image shows.' }),
    caption: Schema.String.annotate({ title: 'Caption' }),
  }),
  provides: [Content.Flow],
}).pipe(Appearance.attach(ImageLook))

const QuoteSlots = Slots.define({ root: part, text: part, cite: part })
const QuoteLook = Appearance.make(QuoteSlots, {
  layer: components,
  recipe: Style.recipeFor(QuoteSlots)({
    base: {
      root: Style.self({
        borderInlineStart: `4px solid ${t.accent.default}`,
        display: 'grid',
        gap: t.space.xs,
        margin: '0',
        paddingInlineStart: t.space.lg,
      }),
      text: Style.self({
        fontFamily: t.font.heading,
        fontSize: t.size.xl,
        lineHeight: t.leading.snug,
        margin: '0',
      }),
      cite: Style.self({ color: t.text.muted, fontStyle: 'normal' }),
    },
  }),
})
export const Quote = Block.define('Quote', {
  Props: Schema.Struct({
    text: Schema.String.check(Schema.isMinLength(1)).annotate({ title: 'Quotation' }),
    cite: Schema.String.annotate({ title: 'Who said it' }),
  }),
  provides: [Content.Flow],
}).pipe(
  Appearance.attach(QuoteLook),
  Block.annotate(BuilderView.controls({ text: Input.multiline() })),
)

const CalloutSlots = Slots.define({ root: part, title: part, body: part })
const calloutTone = (family: 'info' | 'success' | 'warning') => ({
  root: Style.self({ background: t[family].subtle, borderColor: t[family].outline }),
  title: Style.self({ color: t[family].ink }),
})
const CalloutLook = Appearance.make(CalloutSlots, {
  layer: components,
  recipe: Style.recipeFor(CalloutSlots)({
    base: {
      root: Style.self({
        border: '1px solid',
        borderRadius: t.radius.lg,
        display: 'grid',
        gap: t.space['2xs'],
        padding: `${t.space.md} ${t.space.lg}`,
      }),
      title: Style.self({ fontWeight: t.weight.semibold, margin: '0' }),
      body: Style.self({ margin: '0' }),
    },
    variants: {
      tone: {
        info: calloutTone('info'),
        success: calloutTone('success'),
        warning: calloutTone('warning'),
      },
    },
    defaults: { tone: 'info' },
  }),
})
export const Callout = Block.define('Callout', {
  Props: Schema.Struct({
    title: Schema.String.annotate({ title: 'Title' }),
    body: Schema.String.annotate({ title: 'Text' }),
  }),
  provides: [Content.Flow],
}).pipe(
  Appearance.attach(CalloutLook),
  Block.annotate(BuilderView.controls({ body: Input.multiline() })),
)

const DividerSlots = Slots.define({ root: part })
const DividerLook = Appearance.make(DividerSlots, {
  layer: components,
  recipe: Style.recipeFor(DividerSlots)({
    base: {
      root: Style.self({
        border: '0',
        borderBlockStart: `1px solid ${t.outline.subtle}`,
        marginBlock: t.space.md,
        width: '100%',
      }),
    },
  }),
})
export const Divider = Block.define('Divider', {
  Props: Schema.Struct({}),
  provides: [Content.Flow],
}).pipe(Appearance.attach(DividerLook))

// --- Button: the mixins-ui button recipe, its choices the Block's axes ------------

const ButtonLook = Appearance.make(ButtonSlots, { recipe: Recipes.Button })
export const Button = Block.define('Button', {
  Props: Schema.Struct({
    label: Schema.String.check(Schema.isMinLength(1)).annotate({ title: 'Label' }),
    href: Url.annotate({ title: 'Link' }),
  }),
  provides: [Content.Flow, Content.Interactive],
}).pipe(Appearance.attach(ButtonLook))

// --- Blocks that read: the blog, one post, the site's pages -----------------------

/** What a card of a post shows. */
export const PostCard = Entity.select(Post, {
  id: true,
  title: true,
  slug: true,
  excerpt: true,
  cover: true,
  publishedAt: true,
})
type PostCard = typeof PostCard.schema.Type

const PostsSlots = Slots.define({
  root: part,
  heading: part,
  list: part,
  item: part,
  cover: part,
  title: part,
  excerpt: part,
  meta: part,
})
const PostsLook = Appearance.make(PostsSlots, {
  layer: components,
  recipe: Style.recipeFor(PostsSlots)({
    base: {
      root: Layout.stack({ gap: t.space.md }),
      heading: Style.self({ fontFamily: t.font.heading, fontSize: t.size.xl, margin: '0' }),
      list: Style.self({
        display: 'grid',
        gap: t.space.lg,
        listStyle: 'none',
        margin: '0',
        padding: '0',
      }),
      item: Style.compose(
        Style.self({
          background: t.surface.base,
          border: `1px solid ${t.outline.subtle}`,
          borderRadius: t.radius.lg,
          display: 'grid',
          overflow: 'hidden',
        }),
        Style.nest('a', { color: 'inherit', textDecoration: 'none' }),
        Style.nest('a:hover', { color: t.accent.ink }),
      ),
      cover: Style.self({ aspectRatio: '16 / 9' }),
      title: Style.self({
        fontFamily: t.font.heading,
        fontSize: t.size.lg,
        margin: `${t.space.md} ${t.space.md} 0`,
      }),
      excerpt: Style.self({ color: t.text.muted, margin: `${t.space.xs} ${t.space.md} 0` }),
      meta: Style.self({ color: t.text.subtle, fontSize: t.size.sm, margin: t.space.md }),
    },
    variants: {
      layout: {
        grid: {
          list: Style.self({ gridTemplateColumns: 'repeat(auto-fit, minmax(15rem, 1fr))' }),
        },
        list: {},
      },
    },
    defaults: { layout: 'grid' },
  }),
})

const postCards = <M>(
  h: HtmlBuilder<M>,
  drawn: ReturnType<typeof PostsLook.draw<M>>,
  posts: ReadonlyArray<PostCard>,
): Html =>
  h.ul(
    drawn.list.attrs(),
    posts.map(post =>
      h.li(drawn.item.attrs(), [
        h.div(drawn.cover.attrs([h.Style({ background: coverOf(post) })]), []),
        h.h3(drawn.title.attrs(), [h.a([h.Href(postHref(post.slug))], [post.title])]),
        h.p(drawn.excerpt.attrs(), [post.excerpt]),
        h.p(drawn.meta.attrs(), [dateOf(Option.fromNullOr(post.publishedAt))]),
      ]),
    ),
  )

/** Posts as cards, as the PostList Block draws them: the blog's index uses the same look. */
export const postGrid = <M>(h: HtmlBuilder<M>, posts: ReadonlyArray<PostCard>): Html =>
  postCards(h, PostsLook.draw({ appearance: {}, h }), posts)

/** The newest posts: an author picks how many and whether they sit in a grid. */
export const PostList = QueryBlock.define('PostList', {
  Props: Schema.Struct({
    heading: Schema.String.annotate({ title: 'Heading', description: 'Leave empty for none.' }),
    count: Schema.Literals(['3', '6', '9']).annotate({ title: 'How many' }),
  }),
  provides: [Content.Flow],
  query: RecentPosts,
  input: () => ({}),
  select: PostCard,
  first: props => Number(props.count),
}).pipe(Appearance.attach(PostsLook))

/** One post, chosen from the blog, drawn large. */
const FeaturedSlots = Slots.define({
  root: part,
  cover: part,
  body: part,
  eyebrow: part,
  title: part,
  excerpt: part,
  link: part,
})
const FeaturedLook = Appearance.make(FeaturedSlots, {
  layer: components,
  recipe: Style.recipeFor(FeaturedSlots)({
    base: {
      root: Style.compose(
        Layout.switcher({ threshold: '34rem', gap: '0' }),
        Style.self({
          background: t.surface.base,
          border: `1px solid ${t.outline.subtle}`,
          borderRadius: t.radius.xl,
          overflow: 'hidden',
        }),
      ),
      cover: Style.self({ minHeight: '14rem' }),
      body: Style.compose(Layout.stack({ gap: t.space.sm }), Style.self({ padding: t.space.xl })),
      eyebrow: Style.self({
        color: t.accent.ink,
        fontSize: t.size.sm,
        fontWeight: t.weight.semibold,
        margin: '0',
        textTransform: 'uppercase',
      }),
      title: Style.self({ fontFamily: t.font.heading, fontSize: t.size['2xl'], margin: '0' }),
      excerpt: Style.self({ color: t.text.muted, margin: '0' }),
      link: Style.self({ color: t.accent.ink, fontWeight: t.weight.semibold }),
    },
  }),
})
export const FeaturedPost = QueryBlock.define('FeaturedPost', {
  Props: Schema.Struct({
    // Stored as `null` while none is chosen.
    post: Schema.OptionFromNullOr(Schema.String).annotate({ title: 'Post' }),
  }),
  provides: [Content.Flow],
  query: PostById,
  // No post chosen reads nothing: no row has an empty id.
  input: props => ({ id: PostId.make(Option.getOrElse(props.post, () => '')) }),
  select: PostCard,
  first: () => 1,
}).pipe(
  Appearance.attach(FeaturedLook),
  Block.annotate(BuilderView.controls({ post: Input.relationOne(Post) })),
)

/**
 * The site's pages, newest first: an author picks how many, and one page to
 * leave out (the page the list is on, say), never a query. The read goes
 * through Remote with the reader's authority, so it lists what that reader may
 * see of the worklist.
 */
export const LatestPages = QueryBlock.define('LatestPages', {
  Props: Schema.Struct({
    count: Schema.Literals([3, 5]),
    except: Schema.OptionFromNullOr(Schema.String).annotate({ title: 'Leave out' }),
  }),
  provides: [Content.Flow],
  query: Cms.Entries,
  input: () => ({ type: 'pages', search: '', archived: false }),
  select: Entity.select(Cms.Entities.Entry, { id: true, label: true }),
  // One more than shown when one is left out, so the list is still `count` long.
  first: props => props.count + (Option.isSome(props.except) ? 1 : 0),
}).pipe(Block.annotate(BuilderView.controls({ except: Input.relationOne(Cms.Entities.Entry) })))

export const Site = Catalog.make({
  blocks: [
    Hero,
    Section,
    Columns,
    Heading,
    Text,
    Image,
    Quote,
    Callout,
    Divider,
    Button,
    PostList,
    FeaturedPost,
    LatestPages,
  ],
  roots: [Content.Section],
})

/** Every rule a look can draw, for `sheet.ts`. */
export const lookStyles = [
  ...HeroLook.styles,
  ...SectionLook.styles,
  ...ColumnsLook.styles,
  ...HeadingLook.styles,
  ...TextLook.styles,
  ...ImageLook.styles,
  ...QuoteLook.styles,
  ...CalloutLook.styles,
  ...DividerLook.styles,
  ...ButtonLook.styles,
  ...PostsLook.styles,
  ...FeaturedLook.styles,
]

const waiting = <M>(h: HtmlBuilder<M>, what: string): Html =>
  h.p([h.Style({ color: t.text.muted })], [what])

/** The same views draw the public page, the preview, and the editor's canvas. */
export const SiteRenderer = Renderer.make(Site, {
  Hero: ({ props, regions, appearance, h }) => {
    const drawn = HeroLook.draw({ appearance, h })
    return h.header(drawn.root.attrs(), [
      ...(props.eyebrow === '' ? [] : [h.p(drawn.eyebrow.attrs(), [props.eyebrow])]),
      h.h1(drawn.title.attrs(), [props.title]),
      ...(props.lead === '' ? [] : [h.p(drawn.lead.attrs(), [props.lead])]),
      ...(regions.actions.length === 0 ? [] : [h.div(drawn.actions.attrs(), [...regions.actions])]),
    ])
  },
  Section: ({ props, regions, appearance, h }) => {
    const drawn = SectionLook.draw({ appearance, h })
    return h.section(drawn.root.attrs(), [
      h.div(drawn.inner.attrs(), [
        ...(props.heading === '' ? [] : [h.h2(drawn.heading.attrs(), [props.heading])]),
        ...regions.body,
      ]),
    ])
  },
  Columns: ({ regions, appearance, h }) => {
    const drawn = ColumnsLook.draw({ appearance, h })
    return h.div(drawn.root.attrs(), [
      h.div(drawn.left.attrs(), [...regions.left]),
      h.div(drawn.right.attrs(), [...regions.right]),
    ])
  },
  Heading: ({ props, appearance, h }) =>
    h.h2(HeadingLook.draw({ appearance, h }).root.attrs(), [props.text]),
  Text: ({ props, appearance, h }) =>
    h.div(
      TextLook.draw({ appearance, h }).root.attrs(),
      paragraphs(props.body).map(paragraph => h.p([], [paragraph])),
    ),
  Image: ({ props, appearance, h }) => {
    const drawn = ImageLook.draw({ appearance, h })
    return h.figure(drawn.root.attrs(), [
      h.img(drawn.image.attrs([h.Src(props.src), h.Alt(props.alt)])),
      ...(props.caption === '' ? [] : [h.figcaption(drawn.caption.attrs(), [props.caption])]),
    ])
  },
  Quote: ({ props, appearance, h }) => {
    const drawn = QuoteLook.draw({ appearance, h })
    return h.blockquote(drawn.root.attrs(), [
      h.p(drawn.text.attrs(), [props.text]),
      ...(props.cite === '' ? [] : [h.cite(drawn.cite.attrs(), [`— ${props.cite}`])]),
    ])
  },
  Callout: ({ props, appearance, h }) => {
    const drawn = CalloutLook.draw({ appearance, h })
    return h.aside(drawn.root.attrs([h.Role('note')]), [
      ...(props.title === '' ? [] : [h.p(drawn.title.attrs(), [props.title])]),
      h.p(drawn.body.attrs(), [props.body]),
    ])
  },
  Divider: ({ appearance, h }) => h.hr(DividerLook.draw({ appearance, h }).root.attrs()),
  Button: ({ props, appearance, h }) =>
    h.a(ButtonLook.draw({ appearance, h }).button.attrs([h.Href(props.href)]), [props.label]),
  PostList: ({ props, data, appearance, h }) => {
    const drawn = PostsLook.draw({ appearance, h })
    const rows = PostList.rows(data)
    return h.section(drawn.root.attrs(), [
      ...(props.heading === '' ? [] : [h.h2(drawn.heading.attrs(), [props.heading])]),
      rows._tag === 'Ready' || rows._tag === 'Refreshing'
        ? rows.value.items.length === 0
          ? waiting(h, 'Nothing is published yet.')
          : postCards(h, drawn, rows.value.items)
        : waiting(h, 'Loading posts…'),
    ])
  },
  FeaturedPost: ({ props, data, appearance, h }) => {
    const drawn = FeaturedLook.draw({ appearance, h })
    const rows = FeaturedPost.rows(data)
    const found =
      rows._tag === 'Ready' || rows._tag === 'Refreshing'
        ? Arr.head(rows.value.items)
        : Option.none()
    if (Option.isNone(found))
      return waiting(
        h,
        Option.isNone(props.post)
          ? 'Choose a post to feature.'
          : rows._tag === 'Ready'
            ? 'That post is not published.'
            : 'Loading the post…',
      )
    const post = found.value
    return h.article(drawn.root.attrs(), [
      h.div(drawn.cover.attrs([h.Style({ background: coverOf(post) })]), []),
      h.div(drawn.body.attrs(), [
        h.p(drawn.eyebrow.attrs(), ['Featured']),
        h.h2(drawn.title.attrs(), [post.title]),
        h.p(drawn.excerpt.attrs(), [post.excerpt]),
        h.a(drawn.link.attrs([h.Href(postHref(post.slug))]), ['Read the post →']),
      ]),
    ])
  },
  LatestPages: ({ props, data, h }) => {
    const rows = LatestPages.rows(data)
    return rows._tag === 'Ready' || rows._tag === 'Refreshing'
      ? h.ul(
          [],
          rows.value.items
            .filter(item => !Option.contains(props.except, item.id))
            .slice(0, props.count)
            .map(item => h.li([], [item.label])),
        )
      : h.p([], ['Loading pages'])
  },
})

export const PageBuilder = Builder.make('PageBuilder', {
  catalog: Site,
  renderer: SiteRenderer,
  starters: {
    Hero: { eyebrow: 'New', title: 'A headline that says it plainly', lead: '' },
    Section: { heading: '' },
    Columns: {},
    Heading: { text: 'New heading' },
    Text: { body: 'Write something worth reading.' },
    Image: { src: Url.make('/images/meadow.svg'), alt: 'Rolling green hills', caption: '' },
    Quote: { text: 'Simplicity is prerequisite for reliability.', cite: 'Edsger Dijkstra' },
    Callout: { title: 'Good to know', body: 'Say the one thing a reader should not miss.' },
    Divider: {},
    Button: { label: 'Read the blog', href: Url.make('/site/blog') },
    PostList: { heading: 'From the blog', count: '3' },
    FeaturedPost: { post: Option.none() },
    LatestPages: { count: 3, except: Option.none() },
  },
})

/** The Builder drawn: palette, layers, inspector, and the page in edit mode. */
export const PageEditing = BuilderView.define(PageBuilder).pipe(Style.attach(BuilderStyle))
