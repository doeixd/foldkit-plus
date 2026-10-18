/**
 * A chat message and a run of them.
 *
 * `layout: 'chat'` sets the user's messages at the end in a bubble and the
 * others at the start as plain text, as Fluid Functionalism's and shadcn's
 * AI elements do; `thread` sets every message at the start beside its
 * picture with no bubble, as a channel does. `bubble` fills the user's
 * bubble with a muted surface or the accent. `content: 'markdown'` spaces
 * the body as Prose, tighter than a page's.
 *
 * The body wraps lines greedily (`text-wrap: wrap`), not `pretty` as the
 * reset sets every paragraph, since `pretty` balances a paragraph's last
 * lines and so moves earlier words as each new one streams in. A continued
 * message hides its header from sight only, sits closer to the one before,
 * and leaves its picture's room empty. The actions show on hover or focus,
 * at rest when pinned, and always where nothing can hover; hidden, they keep
 * their room, so revealing them moves nothing. A message enters with a
 * fade and a short rise, the rise travelling, so reduced motion keeps the
 * fade.
 */
import { Style, type Declarations } from 'foldkit-mixins'
import { Prose } from 'foldkit-mixins/prose'
import { ladder, role } from 'foldkit-mixins/theme'
import { ChatMessageGroupSlots, ChatMessageSlots } from '../chatMessage.js'
import {
  component,
  disabled,
  focusRing,
  hover,
  ref,
  transition,
  travelled,
  unfilledHover,
  variant,
  controlHeight,
} from './design.js'

const user = '&[data-from="user"]'

/** Out of sight, still read: a continued message's header. */
const unseen: Declarations = {
  position: 'absolute',
  inlineSize: '1px',
  blockSize: '1px',
  overflow: 'hidden',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
}

export const ChatMessage = Style.recipeFor(ChatMessageSlots)({
  base: {
    root: component(
      Style.self({
        position: 'relative',
        display: 'flex',
        alignItems: 'flex-start',
        gap: ref.space.sm,
        minInlineSize: '0',
        color: ref.text.default,
        transitionProperty: 'opacity, translate',
        transitionDuration: `${ref.motion.moderate}, ${travelled(ref.motion.moderate)}`,
        transitionTimingFunction: ref.motion.ease,
      }),
      Style.enter({ opacity: '0', translate: '0 0.25rem' }),
    ),
    avatar: component(
      Style.self({
        flex: 'none',
        display: 'flex',
        justifyContent: 'center',
        minInlineSize: '2rem',
      }),
    ),
    main: component(
      Style.self({
        flex: '1',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: ref.space['2xs'],
        minInlineSize: '0',
      }),
    ),
    header: component(
      Style.self({
        display: 'flex',
        alignItems: 'baseline',
        gap: ref.space.xs,
        ...role('caption'),
        color: ref.text.muted,
      }),
      Style.nest('&[data-continued="true"]', unseen),
    ),
    author: component(Style.self({ fontWeight: ref.weight.semibold, color: ref.text.overt })),
    time: component(Style.self({ fontVariantNumeric: 'tabular-nums' })),
    bubble: component(Style.self({ maxInlineSize: '100%', minInlineSize: '0' })),
    body: component(
      Style.self({
        ...role('body'),
        textWrap: 'wrap',
        overflowWrap: 'break-word',
        minInlineSize: '0',
      }),
      // Beats the reset's `:where(p) { text-wrap: pretty }` by its class, and its layer.
      Style.nest('& :where(p, li, blockquote, h1, h2, h3, h4, h5, h6)', { textWrap: 'wrap' }),
    ),
    footer: component(
      Style.self({
        display: 'flex',
        alignItems: 'center',
        gap: ref.space.xs,
        // A compact rung for the actions and the words beside them.
        '--fk-knob-step': '1',
        ...role('caption'),
        color: ref.text.muted,
      }),
    ),
    status: component(Style.nest('[data-status="failed"] &', { color: ref.error.ink })),
    retry: component(
      Style.self({
        margin: '0',
        padding: '0',
        border: '0',
        background: 'transparent',
        color: ref.text.link,
        font: 'inherit',
        fontWeight: ref.weight.medium,
        textDecoration: 'underline',
        cursor: 'pointer',
      }),
      hover({ color: ref.text['link-hover'] }),
      focusRing,
    ),
    actions: component(
      // Hidden by opacity, not display, so they keep their room and revealing them moves nothing.
      Style.self({
        display: 'flex',
        alignItems: 'center',
        gap: ref.space['3xs'],
        opacity: '0',
        ...transition('opacity'),
      }),
      Style.nest('&[data-pinned="true"]', { opacity: '1' }),
      Style.nest('[data-from]:is(:hover, :focus-within) &', { opacity: '1' }),
      // Nothing can hover to reveal them.
      Style.media('(hover: none)', { opacity: '1' }),
    ),
    action: component(
      Style.self({
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minInlineSize: controlHeight,
        blockSize: controlHeight,
        paddingInline: ref.space['2xs'],
        margin: '0',
        border: '0',
        borderRadius: ref.radius.md,
        background: 'transparent',
        color: ref.text.muted,
        font: 'inherit',
        cursor: 'pointer',
        ...transition('background-color, color'),
      }),
      Style.nest('& > svg', { inlineSize: ladder('icon'), blockSize: ladder('icon') }),
      hover({ background: unfilledHover, color: ref.text.default }),
      Style.pseudo('[aria-pressed="true"]', { color: ref.accent.ink }),
      disabled,
      focusRing,
    ),
  },
  variants: {
    layout: {
      chat: {
        root: variant(Style.nest(user, { flexDirection: 'row-reverse' })),
        main: variant(
          Style.nest(`[data-from="user"] > &`, {
            alignItems: 'flex-end',
            maxInlineSize: 'min(80%, 40rem)',
          }),
        ),
        bubble: variant(
          Style.nest(`[data-from="user"] &`, {
            paddingBlock: ref.space.xs,
            paddingInline: ref.space.sm,
            borderRadius: ref.radius.xl,
          }),
        ),
      },
      thread: {},
    },
    bubble: {
      muted: {
        bubble: variant(Style.nest('[data-from="user"] &', { background: ref.surface.muted })),
      },
      accent: {
        bubble: variant(
          Style.nest('[data-from="user"] &', {
            background: ref.accent.default,
            color: ref.accent['on-fill'],
          }),
        ),
      },
    },
    content: {
      // A user's own words keep their line breaks.
      text: { body: variant(Style.self({ whiteSpace: 'pre-wrap' })) },
      markdown: {
        body: variant(
          Prose.style(),
          Style.self({
            '--fk-prose-measure': '100%',
            '--fk-prose-paragraph': ref.space.sm,
            '--fk-prose-heading': ref.space.md,
            '--fk-prose-figure': ref.space.sm,
          }),
        ),
      },
    },
  },
  defaults: { layout: 'chat', bubble: 'muted', content: 'text' },
})

/** A run of messages: apart between senders, close within one. */
export const ChatMessageGroup = Style.recipeFor(ChatMessageGroupSlots)({
  base: {
    root: component(
      Style.self({ display: 'flex', flexDirection: 'column' }),
      Style.nest('& > * + *', { marginBlockStart: ref.space.md }),
      Style.nest('& > [data-continued="true"]', { marginBlockStart: ref.space['2xs'] }),
    ),
  },
  variants: {},
  defaults: {},
})
