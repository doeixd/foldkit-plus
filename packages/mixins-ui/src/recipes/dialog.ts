/**
 * A modal dialog: the backdrop dims the page and the panel is a raised
 * surface no taller than the viewport, whose `scroll` scrolls between its
 * heading and its `footer`. `size` is the panel's maximum width (`full`
 * fills the viewport less a margin). A panel `covered` by a dialog opened
 * from it steps back, smaller.
 */
import { Style } from 'foldkit-mixins'
import { raise, raisedSurface, role } from 'foldkit-mixins/theme'
import { Utilities } from 'foldkit-mixins/utilities'
import { DialogSlots } from '../dialog.js'
import { component, focusRing, hover, presence, ref, variant } from './design.js'
import { bar, overlaid, thumb } from './scrollBars.js'

/** A width one notch narrower in a compact region, as Fluid Functionalism's (400px to 360px). */
/**
 * What the screen leaves a panel: the viewport less a margin and what a notch, a rounded
 * corner or the home indicator takes from each side (0 unless the page covers the screen).
 */
const room = {
  block: `100% - 2rem - ${ref.safe.top} - ${ref.safe.bottom}`,
  inline: `100% - 2rem - ${ref.safe.left} - ${ref.safe.right}`,
}

const width = (max: string) =>
  variant(
    Style.self({
      maxInlineSize: `min(calc(${max} * (1 - 0.1 * ${ref.knob.step})), ${room.inline})`,
    }),
  )

export const Dialog = Style.recipeFor(DialogSlots)({
  base: {
    dialog: component(
      Style.self({
        // `Defaults.reset` zeroes every margin, which takes away the user
        // agent's `margin: auto` and drops the modal in the top corner.
        margin: 'auto',
        padding: '0',
        border: '0',
        background: 'transparent',
        color: ref.text.default,
        maxInlineSize: '100%',
        maxBlockSize: '100%',
      }),
      Style.pseudo('::backdrop', { background: 'transparent' }),
      // `@foldkit/ui` draws the open dialog over the whole viewport, so
      // `margin: auto` centers nothing and the panel sits at the top: the
      // grid centers it. Only while open, or `display` would beat the user
      // agent's `dialog:not([open]) { display: none }`.
      Style.nest('&[open]', { display: 'grid', placeItems: 'center' }),
    ),
    backdrop: component(
      Style.self({
        position: 'fixed',
        inset: '0',
        background: `color-mix(in oklch, ${ref.surface.bedrock} 45%, transparent)`,
      }),
      // The veil fades with its panel.
      presence('slow', {}),
    ),
    panel: component(
      Style.self({
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        gap: ref.space.sm,
        // With the reset's content box, the padding and border added to the
        // width a size allows, and a phone's panel ran past its margins.
        boxSizing: 'border-box',
        inlineSize: '100%',
        maxBlockSize: `calc(${room.block})`,
        // A panel drawn without `scroll` scrolls whole rather than leave the viewport.
        overflowY: 'auto',
        // Held off each screen edge by what it takes there, and centered by the dialog's
        // grid in what is left. Physical, as the screen's insets are.
        marginTop: ref.safe.top,
        marginRight: ref.safe.right,
        marginBottom: ref.safe.bottom,
        marginLeft: ref.safe.left,
        padding: ref.space.lg,
        border: `${ref.border.thin} solid ${ref.outline.subtle}`,
        borderRadius: ref.radius.lg,
        background: raisedSurface(),
        boxShadow: ref.shadow['2xl'],
      }),
      // Four levels up: a popover opened in it lands two above it.
      raise(4),
      // The largest thing that moves: the slow tier, from a little smaller.
      presence('slow', { scale: '0.97' }),
      // Under a dialog opened from it: a step back, as Base UI's nested dialogs.
      Style.pseudo('[data-covered]', { scale: '0.94', translate: `0 calc(-1 * ${ref.space.md})` }),
    ),
    body: component(
      Style.self({
        position: 'relative',
        display: 'grid',
        flex: '1 1 auto',
        minBlockSize: '0',
        // The panel's padding, taken back, so the bar lies at the panel's edge.
        marginInline: `calc(-1 * ${ref.space.lg})`,
      }),
    ),
    scroll: component(
      Style.self({
        minBlockSize: '0',
        overflowY: 'auto',
        overscrollBehavior: 'contain',
        paddingInline: ref.space.lg,
      }),
      Utilities.scrollFade('block'),
      overlaid,
    ),
    scrollBar: bar,
    scrollThumb: thumb,
    footer: component(
      Style.self({
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'flex-end',
        gap: ref.space.xs,
        paddingBlockStart: ref.space.xs,
      }),
    ),
    title: component(
      Style.self({
        margin: '0',
        color: ref.text.overt,
        fontFamily: ref.font.heading,
        ...role('title'),
        fontWeight: ref.weight.semibold,
      }),
    ),
    description: component(Style.self({ margin: '0', color: ref.text.muted })),
    closeButton: component(
      Style.self({
        position: 'absolute',
        insetBlockStart: ref.space.sm,
        insetInlineEnd: ref.space.sm,
        padding: ref.space['2xs'],
        border: '0',
        borderRadius: ref.radius.sm,
        background: 'transparent',
        color: ref.text.muted,
        cursor: 'pointer',
      }),
      hover({
        background: ref.surface.muted,
        color: ref.text.overt,
      }),
      focusRing,
    ),
  },
  variants: {
    size: {
      sm: { panel: width('24rem') },
      md: { panel: width('32rem') },
      lg: { panel: width('48rem') },
      xl: { panel: width('64rem') },
      full: {
        panel: variant(
          Style.self({ maxInlineSize: `calc(${room.inline})`, blockSize: `calc(${room.block})` }),
        ),
      },
    },
  },
  defaults: { size: 'md' },
})
