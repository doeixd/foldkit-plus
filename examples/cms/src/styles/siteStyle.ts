/**
 * The public site's look: its shell and its article, as `SiteSlots` publishes them.
 */
import { PAGE_CONTAINER } from 'foldkit-composition/foldkit'
import { Slots, Style } from 'foldkit-mixins'
import { Loading } from 'foldkit-mixins-crud'
import { Touch } from 'foldkit-mixins-ui'
import { Layout } from 'foldkit-mixins/layout'
import { Prose } from 'foldkit-mixins/prose'
import {
  app,
  button,
  control,
  controlHeight,
  L,
  navLink,
  part,
  phone,
  serif,
  skipLink,
  t,
} from './style.js'

// --- the public site --------------------------------------------------------------

export const SiteSlots = Slots.define({
  root: part,
  /** The way past the bar for a keyboard: first in the page, shown when it takes focus. */
  skipLink: control,
  /** The bar across the top: the brand, the site's sections, and the way to the studio. */
  header: part,
  brand: part,
  brandMark: part,
  nav: part,
  navLink: control,
  /** The way back to the studio, for an author reading the site. */
  studio: control,
  /** The way to this demo's code. On a phone the footer's link is the way. */
  source: control,
  main: part,
  /** The top of the blog: its name and what it is about. */
  masthead: part,
  heading: part,
  lede: part,
  article: part,
  /** A post's date, title and excerpt, centred above its cover. */
  articleHead: part,
  meta: part,
  title: part,
  standfirst: part,
  cover: part,
  body: part,
  back: control,
  footer: part,
  footerNav: part,
  status: part,
})

/** At most `width` wide, in the middle of what holds it. */
const centred = (width: string) =>
  Style.self({ marginInline: 'auto', maxWidth: width, width: '100%' })

export const SiteStyle = Style.forSlots(SiteSlots)(
  {
    root: Style.self({
      background: t.surface.base,
      color: t.text.default,
      display: 'grid',
      fontFamily: t.font.body,
      gridTemplateRows: 'auto 1fr auto',
      minHeight: '100vh',
    }),
    skipLink,
    header: Style.compose(
      L.in(
        'layouts',
        Layout.cluster({ gap: t.space.md, justify: 'space-between', align: 'center' }),
      ),
      Style.self({
        // Solid, the page's own color, as the studio's bar: a translucent one
        // over a blurred, saturated backdrop stood out from the page.
        background: t.surface.base,
        borderBottom: `1px solid ${t.outline.subtle}`,
        boxSizing: 'border-box',
        // As wide as the page's content, without a wrapper around the header's parts.
        paddingBlock: t.space.sm,
        paddingInline: `max(${t.space.lg}, calc((100% - 72rem) / 2 + ${t.space.lg}))`,
        position: 'sticky',
        top: '0',
        zIndex: '10',
      }),
    ),
    brand: Style.compose(
      Touch.target,
      Style.self({
        alignItems: 'center',
        color: t.text.overt,
        display: 'inline-flex',
        fontFamily: t.font.heading,
        fontSize: t.size.lg,
        fontWeight: t.weight.bold,
        gap: t.space.xs,
        letterSpacing: '-0.02em',
        textDecoration: 'none',
      }),
    ),
    brandMark: Style.self({
      alignItems: 'center',
      background: `linear-gradient(135deg, ${t.accent.default}, color-mix(in oklch, ${t.accent.default} 50%, ${t.tertiary.default}))`,
      borderRadius: t.radius.md,
      color: t.accent['on-fill'],
      display: 'inline-flex',
      fontSize: t.size.sm,
      height: '1.75rem',
      justifyContent: 'center',
      width: '1.75rem',
    }),
    nav: L.in('layouts', Layout.cluster({ gap: '2px', align: 'center' })),
    navLink,
    // The accent's solid button, as the studio's primary actions are, at a row's height.
    studio: Style.compose(
      button({ tone: 'accent', variant: 'solid', size: 'sm' }),
      Touch.target,
      Style.self({ marginInlineStart: t.space.xs, minBlockSize: controlHeight }),
    ),
    // A fourth link wrapped the studio's button under the others on a phone.
    source: Style.compose(navLink, Style.media(phone, { display: 'none' })),
    main: Style.compose(
      L.in('layouts', Layout.stack({ gap: t.space['2xl'] })),
      centred('72rem'),
      Style.self({
        // The page's container, as the builder's frame is: a look measures the page.
        containerType: 'inline-size',
        containerName: PAGE_CONTAINER,
        boxSizing: 'border-box',
        paddingBlock: `${t.space.xl} ${t.space['3xl']}`,
        paddingInline: t.space.lg,
      }),
      Touch.targets,
    ),
    masthead: Style.compose(
      L.in('layouts', Layout.stack({ gap: t.space.xs })),
      Style.self({ paddingBlockStart: t.space.xl, textAlign: 'center' }),
    ),
    heading: Style.self({
      color: t.text.overt,
      fontFamily: t.font.heading,
      fontSize: 'clamp(2.4rem, 6vw, 3.6rem)',
      letterSpacing: '-0.03em',
      lineHeight: '1.05',
      margin: '0',
    }),
    lede: Style.self({
      color: t.text.muted,
      fontSize: t.size.lg,
      margin: '0 auto',
      maxWidth: '36rem',
    }),
    article: L.in('layouts', Layout.stack({ gap: t.space.xl })),
    articleHead: Style.compose(
      centred('48rem'),
      L.in('layouts', Layout.stack({ gap: t.space.sm })),
      Style.self({ paddingBlockStart: t.space.lg, textAlign: 'center' }),
    ),
    meta: Style.self({
      color: t.text.muted,
      fontSize: t.size.xs,
      fontWeight: t.weight.semibold,
      letterSpacing: '0.06em',
      margin: '0',
      textTransform: 'uppercase',
    }),
    title: Style.self({
      color: t.text.overt,
      fontFamily: t.font.heading,
      fontSize: 'clamp(2.2rem, 5.5vw, 3.4rem)',
      letterSpacing: '-0.03em',
      lineHeight: '1.08',
      margin: '0',
      textWrap: 'balance',
    }),
    standfirst: Style.self({
      color: t.text.muted,
      fontSize: 'clamp(1.1rem, 2vw, 1.3rem)',
      lineHeight: '1.5',
      margin: '0',
      textWrap: 'pretty',
    }),
    cover: Style.compose(
      centred('68rem'),
      Style.self({ aspectRatio: '21 / 9', borderRadius: t.radius.xl }),
    ),
    body: Style.compose(
      L.in('components', Prose.style({ measure: '44rem', leading: '1.75' })),
      Style.self({ fontFamily: serif, fontSize: '1.25rem', marginInline: 'auto', width: '100%' }),
      Style.nest('h2', {
        color: t.text.overt,
        fontSize: '1.35rem',
        letterSpacing: '-0.01em',
      }),
      Style.nest('code', { fontFamily: t.font.mono, fontSize: '0.8em' }),
      Style.nest(':not(pre) > code', {
        background: t.surface.muted,
        borderRadius: t.radius.sm,
        padding: '0.1em 0.3em',
      }),
      Style.nest('pre', {
        background: t.surface.muted,
        border: `1px solid ${t.outline.subtle}`,
        borderRadius: t.radius.md,
        fontSize: '0.95rem',
        lineHeight: '1.55',
        padding: `${t.space.sm} ${t.space.md}`,
      }),
      Style.nest('pre code', { fontSize: 'inherit' }),
    ),
    back: Style.compose(
      centred('44rem'),
      Style.self({
        color: t.accent.ink,
        fontWeight: t.weight.semibold,
        textDecoration: 'none',
      }),
      Style.pseudo(':hover', { textDecoration: 'underline' }),
    ),
    footer: Style.compose(
      L.in(
        'layouts',
        Layout.cluster({ gap: t.space.md, justify: 'space-between', align: 'center' }),
      ),
      Style.self({
        background: t.surface.subtle,
        borderTop: `1px solid ${t.outline.subtle}`,
        boxSizing: 'border-box',
        color: t.text.muted,
        fontSize: t.size.sm,
        paddingBlock: t.space.lg,
        paddingInline: `max(${t.space.lg}, calc((100% - 72rem) / 2 + ${t.space.lg}))`,
      }),
    ),
    footerNav: Style.compose(
      L.in('layouts', Layout.cluster({ gap: t.space.md })),
      Style.nest('a', {
        alignItems: 'center',
        color: 'inherit',
        display: 'inline-flex',
        textDecoration: 'none',
      }),
      Touch.targets,
      Style.nest('a:hover', { color: t.text.overt }),
    ),
    status: Style.compose(
      Style.self({
        color: t.text.muted,
        padding: `${t.space['3xl']} 0`,
        textAlign: 'center',
      }),
      Loading.shown,
    ),
  },
  { name: 'SiteStyle', layer: app },
)
