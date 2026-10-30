/**
 * Chirp's look, after the one people know: a narrow column of posts between
 * hairlines, a nav down the left, accounts on the right. Below `MID` the nav
 * keeps only its icons and the accounts move above the posts; below `NARROW`
 * the nav becomes a bar along the bottom of the screen.
 *
 * `AppStyle` compiles every style into the `app` layer, the last of the
 * standard order, so these override the shipped recipes by layer order.
 */
import { GuideSlots } from 'foldkit-example-site/guide'
import { Capability, Style, type Piece } from 'foldkit-mixins'
import { AppStyle } from 'foldkit-mixins/app'
import { Theme } from 'foldkit-mixins/theme'
import { Utilities as U } from 'foldkit-mixins/utilities'
import { FieldSlots, FormSlots } from 'foldkit-mixins-form'
import { AvatarSlots, Recipes, TextareaSlots } from 'foldkit-mixins-ui'

// #region theme
export const { t, slots, forSlots, stylesheet } = AppStyle.make({
  tokens: Theme.define({ chirp: { like: 'oklch(62% 0.24 0)' } }),
  colorScheme: 'light',
})
// #endregion

/** Below this, the nav is icons only and the accounts sit above the posts. */
const MID = '(max-width: 69.99rem)'
/** A phone: one column, the nav a bar along the bottom. */
const NARROW = '(max-width: 43.74rem)'

const rule = `${t.border.thin} solid ${t.outline.subtle}`
/** A faint wash of the text's colour: what a row under the pointer reads. */
const wash = `color-mix(in oklch, ${t.text.overt} 4%, transparent)`
const tint = (color: string) => `color-mix(in oklch, ${color} 12%, transparent)`
const pill = { borderRadius: '9999px', border: '0', cursor: 'pointer', textDecoration: 'none' }

/** Something pressed or followed: its focus ring drawn in the accent. */
const focusable = (...pieces: ReadonlyArray<Piece>) =>
  Style.slot({ capability: Capability.Focusable }, [
    ...pieces,
    Style.pseudo(':focus-visible', {
      outline: `2px solid ${t.accent.default}`,
      outlineOffset: '2px',
    }),
  ])

/** A small action under a post: an icon in a round that tints in `color` on hover. */
const action = (color: string, ...more: ReadonlyArray<Piece>) =>
  focusable(
    {
      display: 'inline-flex',
      alignItems: 'center',
      gap: t.space['2xs'],
      padding: '0',
      border: '0',
      background: 'none',
      cursor: 'pointer',
      color: t.text.muted,
      fontSize: '0.8125rem',
    },
    Style.pseudo(':hover', { color }),
    Style.nest('&:hover > span:first-child', { background: tint(color) }),
    ...more,
  )

export const ChirpPage = slots(
  {
    page: [U.bg('surface.base'), U.color('text.default'), { minHeight: '100dvh' }],
    frame: [{ display: 'flex', justifyContent: 'center' }],

    // The nav down the left.
    nav: [
      {
        position: 'sticky',
        top: '0',
        height: '100dvh',
        width: '16rem',
        display: 'flex',
        flexDirection: 'column',
        gap: t.space.xs,
        padding: `${t.space.xs} ${t.space.md}`,
        flexShrink: '0',
      },
      Style.media(MID, { width: '5.5rem', alignItems: 'center', padding: t.space.xs }),
      Style.media(NARROW, { display: 'none' }),
    ],
    logo: focusable(
      {
        ...pill,
        display: 'inline-flex',
        alignSelf: 'flex-start',
        padding: t.space.sm,
        color: t.accent.default,
        fontSize: '1.875rem',
      },
      Style.pseudo(':hover', { background: tint(t.accent.default) }),
      Style.media(MID, { alignSelf: 'center' }),
    ),
    navLink: focusable(
      {
        ...pill,
        display: 'inline-flex',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: t.space.lg,
        padding: `${t.space.sm} ${t.space.lg} ${t.space.sm} ${t.space.sm}`,
        fontSize: '1.25rem',
        color: t.text.overt,
      },
      Style.pseudo(':hover', { background: wash }),
      Style.states({ page: { fontWeight: '700' } }, 'aria-current'),
      Style.media(MID, { alignSelf: 'center', padding: t.space.sm }),
    ),
    icon: [{ display: 'inline-flex', fontSize: '1.625rem' }],
    navLabel: [Style.media(MID, { display: 'none' })],
    postButton: focusable(
      {
        ...pill,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: t.space.md,
        width: '90%',
        height: '3.25rem',
        fontSize: '1.0625rem',
        fontWeight: '700',
        background: t.accent.default,
        color: t.accent['on-fill'],
      },
      Style.pseudo(':hover', { background: t.accent.hover }),
      Style.media(MID, { width: '3.25rem', fontSize: '1.5rem' }),
    ),
    postWord: [Style.media(MID, { display: 'none' })],
    postIcon: [{ display: 'none' }, Style.media(MID, { display: 'inline-flex' })],
    account: [
      {
        marginTop: 'auto',
        marginBottom: t.space.md,
        display: 'flex',
        alignItems: 'center',
        gap: t.space.sm,
        padding: t.space.sm,
      },
    ],
    accountText: [
      { display: 'flex', flexDirection: 'column', lineHeight: '1.25' },
      Style.media(MID, { display: 'none' }),
    ],

    // The column of posts.
    main: [
      { width: '37.5rem', maxWidth: '100%', minHeight: '100dvh', borderInline: rule },
      Style.media(NARROW, { width: '100%', borderInline: '0', paddingBottom: '4rem' }),
    ],
    header: [
      {
        position: 'sticky',
        top: '0',
        zIndex: '10',
        display: 'flex',
        alignItems: 'center',
        gap: t.space.lg,
        minHeight: '3.3rem',
        padding: `0 ${t.space.md}`,
        background: `color-mix(in oklch, ${t.surface.base} 85%, transparent)`,
        backdropFilter: 'blur(12px)',
        borderBottom: rule,
      },
    ],
    headerLogo: [
      { display: 'none', color: t.accent.default, fontSize: '1.75rem' },
      Style.media(NARROW, { display: 'inline-flex', marginLeft: 'auto' }),
    ],
    title: [{ margin: '0', fontSize: '1.25rem', fontWeight: '700', color: t.text.overt }],
    back: focusable(
      {
        ...pill,
        display: 'inline-flex',
        padding: t.space.xs,
        fontSize: '1.25rem',
        color: t.text.overt,
      },
      Style.pseudo(':hover', { background: wash }),
    ),

    // Who you are, above the posts below `MID`.
    strip: [
      {
        display: 'none',
        alignItems: 'center',
        gap: t.space.sm,
        overflowX: 'auto',
        padding: `${t.space.sm} ${t.space.md}`,
        borderBottom: rule,
        fontSize: '0.875rem',
        color: t.text.muted,
        whiteSpace: 'nowrap',
      },
      Style.nest('& > *', { flexShrink: '0' }),
      Style.media(MID, { display: 'flex' }),
    ],

    // The compose box, and a post: an avatar beside everything else.
    row: [
      {
        display: 'grid',
        gridTemplateColumns: '2.5rem minmax(0, 1fr)',
        gap: t.space.sm,
        padding: `${t.space.sm} ${t.space.md}`,
        borderBottom: rule,
      },
    ],
    post: [
      {
        display: 'grid',
        gridTemplateColumns: '2.5rem minmax(0, 1fr)',
        gap: t.space.sm,
        padding: `${t.space.sm} ${t.space.md}`,
        borderBottom: rule,
        transition: 'background 0.2s',
      },
      Style.pseudo(':hover', { background: wash }),
    ],
    postHead: [
      {
        display: 'flex',
        alignItems: 'baseline',
        gap: t.space['2xs'],
        minWidth: '0',
        whiteSpace: 'nowrap',
      },
    ],
    name: focusable(
      {
        fontWeight: '700',
        color: t.text.overt,
        textDecoration: 'none',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      },
      Style.pseudo(':hover', { textDecoration: 'underline' }),
    ),
    quiet: [{ color: t.text.muted, overflow: 'hidden', textOverflow: 'ellipsis' }],
    stamp: focusable(
      { color: t.text.muted, textDecoration: 'none', flexShrink: '0' },
      Style.pseudo(':hover', { textDecoration: 'underline' }),
    ),
    body: [
      {
        margin: `${t.space['2xs']} 0 0`,
        color: t.text.overt,
        lineHeight: '1.35',
        whiteSpace: 'pre-wrap',
        overflowWrap: 'anywhere',
      },
    ],
    actions: [
      {
        display: 'flex',
        alignItems: 'center',
        gap: t.space['2xl'],
        marginTop: t.space['2xs'],
        marginLeft: `calc(-1 * ${t.space.xs})`,
      },
    ],
    // The like: filled and pink while liked.
    like: action(
      t.chirp.like,
      Style.states({ true: { color: t.chirp.like } }, 'aria-pressed'),
      Style.nest('&[aria-pressed="true"] svg, &[aria-pressed="true"] svg *', {
        fill: 'currentColor',
      }),
    ),
    edit: action(t.accent.default),
    round: [
      {
        display: 'inline-flex',
        padding: '0.5rem',
        borderRadius: '9999px',
        fontSize: '1.125rem',
        transition: 'background 0.2s',
      },
    ],
    editing: [{ display: 'flex', flexDirection: 'column', gap: t.space.xs }],
    note: [{ margin: '0', fontSize: '0.875rem', color: t.text.muted }],
    done: focusable(
      {
        ...pill,
        alignSelf: 'flex-start',
        padding: `${t.space['2xs']} ${t.space.md}`,
        fontWeight: '700',
        background: 'none',
        border: rule,
        color: t.text.overt,
      },
      Style.pseudo(':hover', { background: wash }),
    ),
    empty: [{ padding: t.space['2xl'], textAlign: 'center', color: t.text.muted }],

    // A profile's head.
    banner: [
      {
        height: '8rem',
        background: `linear-gradient(135deg, ${t.accent.default}, color-mix(in oklch, ${t.accent.default} 35%, ${t.surface.base}))`,
      },
    ],
    profile: [{ padding: `0 ${t.space.md} ${t.space.md}`, borderBottom: rule }],
    // Raised into the banner; its cutout is the avatar's own ring (`PortraitStyle`).
    portrait: [{ display: 'inline-flex', marginTop: '-2.75rem' }],
    profileName: [
      { margin: `${t.space.xs} 0 0`, fontSize: '1.25rem', fontWeight: '800', color: t.text.overt },
    ],
    profileHandle: [{ margin: '0', color: t.text.muted }],

    // The accounts, beside the posts on a wide screen.
    aside: [
      { width: '21rem', padding: `${t.space.sm} ${t.space.xl}`, flexShrink: '0' },
      Style.media(MID, { display: 'none' }),
    ],
    panel: [
      {
        position: 'sticky',
        top: t.space.sm,
        borderRadius: '1rem',
        border: rule,
        overflow: 'hidden',
      },
    ],
    panelTitle: [
      {
        margin: '0',
        padding: `${t.space.sm} ${t.space.md}`,
        fontSize: '1.25rem',
        fontWeight: '800',
        color: t.text.overt,
      },
    ],
    person: [
      {
        display: 'flex',
        alignItems: 'center',
        gap: t.space.sm,
        padding: `${t.space.sm} ${t.space.md}`,
      },
      Style.pseudo(':hover', { background: wash }),
    ],
    personText: [
      { display: 'flex', flexDirection: 'column', minWidth: '0', flex: '1', lineHeight: '1.25' },
    ],
    strong: [
      {
        fontWeight: '700',
        color: t.text.overt,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      },
    ],
    switchTo: focusable(
      {
        ...pill,
        padding: `${t.space['2xs']} ${t.space.md}`,
        fontWeight: '700',
        fontSize: '0.875rem',
        background: t.text.overt,
        color: t.surface.base,
      },
      Style.pseudo(':hover', { opacity: '0.85' }),
    ),
    here: [{ fontSize: '0.8125rem', color: t.text.muted }],
    panelFoot: [{ padding: `${t.space.sm} ${t.space.md}`, fontSize: '0.875rem' }],
    link: focusable(
      { color: t.accent.default, textDecoration: 'none' },
      Style.pseudo(':hover', { textDecoration: 'underline' }),
    ),

    // The bar along the bottom of a phone.
    tabbar: [
      { display: 'none' },
      Style.media(NARROW, {
        position: 'fixed',
        insetInline: '0',
        bottom: '0',
        zIndex: '20',
        display: 'flex',
        justifyContent: 'space-around',
        paddingBottom: 'env(safe-area-inset-bottom)',
        background: t.surface.base,
        borderTop: rule,
      }),
    ],
    tab: focusable(
      { display: 'inline-flex', padding: t.space.md, fontSize: '1.625rem', color: t.text.muted },
      Style.states({ page: { color: t.text.overt } }, 'aria-current'),
    ),
  },
  { name: 'ChirpPage' },
)

export const AvatarStyle = forSlots(AvatarSlots)(Recipes.Avatar({ color: 'name' }), {
  name: 'ChirpAvatar',
})
/**
 * A profile's avatar, cut out of the banner by a band of the page: the
 * recipe's ring, a shadow of the avatar itself, so the cutout takes whatever
 * shape the avatar has (a rounded square at the theme's radius).
 */
export const PortraitStyle = forSlots(AvatarSlots)(
  Recipes.Avatar({ color: 'name', size: 'xl', ring: 'page' }),
  { name: 'ChirpPortrait' },
)

/** A form's field: the label for screen readers, the placeholder for eyes. */
export const FieldStyle = forSlots(FieldSlots)(
  {
    root: [{ display: 'flex', flexDirection: 'column', gap: t.space.xs }],
    label: [U.srOnly],
    error: [U.text('sm'), { color: t.error.default }],
  },
  { name: 'ChirpField' },
)

/** The box: borderless, large, growing with what is typed. */
export const TextareaStyle = forSlots(TextareaSlots)(
  {
    textarea: [
      {
        width: '100%',
        minHeight: '3.25rem',
        padding: `${t.space.sm} 0`,
        border: '0',
        outline: 'none',
        resize: 'none',
        background: 'transparent',
        color: t.text.overt,
        fontFamily: 'inherit',
        fontSize: '1.25rem',
        lineHeight: '1.3',
        fieldSizing: 'content',
      },
      Style.pseudo('::placeholder', { color: t.text.muted }),
    ],
  },
  { name: 'ChirpTextarea' },
)

/** A form: its field, then the submit as a pill at the end of the row. */
export const FormStyle = forSlots(FormSlots)(
  {
    root: [{ display: 'flex', flexDirection: 'column', gap: t.space.xs }],
    submit: [
      {
        ...pill,
        alignSelf: 'flex-end',
        width: 'fit-content',
        // The word's line trimmed to its capitals and baseline, in a box of a
        // set height that the button centers it in. Untrimmed, the font's
        // ascent above the capitals, larger than its descent, sat them low.
        blockSize: '2.75rem',
        padding: `0 ${t.space.lg}`,
        textBox: 'trim-both cap alphabetic',
        fontWeight: '700',
        background: t.accent.default,
        color: t.accent['on-fill'],
      },
      Style.pseudo(':hover', { background: t.accent.hover }),
      Style.pseudo(':disabled', { opacity: '0.5', cursor: 'default' }),
    ],
  },
  { name: 'ChirpForm' },
)

/** The demo's guide stays clear of the phone's bottom bar. */
export const GuideOffset = forSlots(GuideSlots)(
  { root: [Style.media(NARROW, { insetBlockEnd: '4.5rem' })] },
  { name: 'ChirpGuide' },
)
