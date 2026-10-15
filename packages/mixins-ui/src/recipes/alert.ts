/**
 * An alert in the two layouts its view draws, read from the root's
 * `data-layout`, since the view decides the markup. Inline, a rounded band:
 * the icon beside a semibold title over the description, the actions below,
 * a dismiss button at the end of the first line. As a banner, a strip the
 * full width of what holds it: the words centered between the icon and the
 * actions, the dismiss button held out of the flow. `tone` picks the feedback
 * family; `emphasis` reads it as a tint (`subtle`, the family's tint and ink,
 * with a hairline under a banner) or a solid band (`bold`, the fill and the
 * text on it), so the two axes need no compound per pair. The actions and the
 * dismiss button take the band's text color and hover with `unfilledHover`,
 * which reads on either.
 */
import { Style, type StyleValue } from 'foldkit-mixins'
import { ladder, role } from 'foldkit-mixins/theme'
import { AlertSlots, type AlertTone } from '../alert.js'
import { component, focusRing, ref, transition, unfilledHover, variant } from './design.js'

const toned = (tone: AlertTone): StyleValue =>
  variant(
    Style.self({
      '--_fk-alert-subtle': ref[tone].subtle,
      '--_fk-alert-ink': ref[tone].ink,
      '--_fk-alert-fill': ref[tone].default,
      '--_fk-alert-on-fill': ref[tone]['on-fill'],
      '--_fk-alert-line': ref[tone].outline,
    }),
  )

// What the actions and the dismiss button share: no chrome of their own, the band's text.
const quiet: ReadonlyArray<StyleValue> = [
  Style.self({
    flex: 'none',
    border: '0',
    borderRadius: ref.radius.md,
    background: 'transparent',
    color: 'inherit',
    font: 'inherit',
    cursor: 'pointer',
    ...transition('background-color'),
  }),
  Style.pseudo(':hover', { background: unfilledHover }),
  focusRing,
]

const banner = '[data-layout="banner"]'
// A slot of a banner: the root's own children only, so an alert nested in one keeps its layout.
const inBanner = `${banner} > &`

// Room on each side for a banner's dismiss button, held out of the flow so the words stay centered.
const corner = `calc(${ladder('height')} + ${ref.space.sm})`

export const Alert = Style.recipeFor(AlertSlots)({
  base: {
    // Inline: the title over the description, the icon beside both. In a row,
    // the title was squeezed into a narrow column once the alert was. The
    // icon's room is its margin, not a column gap, so an alert with no icon
    // has none.
    root: component(
      Style.self({
        display: 'grid',
        gridTemplateColumns: 'auto minmax(0, 1fr) auto',
        alignItems: 'start',
        padding: ref.space.md,
        borderRadius: ref.radius.md,
        ...role('body'),
      }),
      Style.pseudo(banner, {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexWrap: 'wrap',
        columnGap: ref.space.sm,
        rowGap: ref.space['3xs'],
        inlineSize: '100%',
        boxSizing: 'border-box',
        paddingBlock: ref.space.xs,
        paddingInline: ref.space.md,
        position: 'relative',
        borderRadius: '0',
        borderBlockEnd: `${ref.border.thin} solid var(--_fk-alert-edge)`,
      }),
      // Only with a dismiss button: kept on a banner without one, the room
      // squeezed a phone's message into the middle of the strip.
      Style.pseudo(`${banner}[data-dismissible="true"]`, { paddingInline: corner }),
    ),
    icon: component(
      Style.self({
        display: 'inline-flex',
        flex: 'none',
        gridRow: 'span 2',
        marginInlineEnd: ref.space.sm,
      }),
      Style.nest(inBanner, { marginInlineEnd: '0' }),
    ),
    title: component(
      Style.self({
        gridColumn: '2',
        margin: '0',
        ...role('body'),
        fontWeight: ref.weight.semibold,
      }),
    ),
    description: component(
      Style.self({
        gridColumn: '2',
        margin: '0',
        marginBlockStart: ref.space['3xs'],
        ...role('body'),
      }),
      Style.nest(inBanner, { marginBlockStart: '0' }),
    ),
    actions: component(
      Style.self({
        gridColumn: '2',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: ref.space.xs,
        marginBlockStart: ref.space.sm,
      }),
      Style.nest(inBanner, { marginBlockStart: '0' }),
    ),
    action: component(
      ...quiet,
      Style.self({
        display: 'inline-flex',
        alignItems: 'center',
        minBlockSize: ladder('height'),
        paddingInline: ladder('pad'),
        fontWeight: ref.weight.semibold,
        textDecoration: 'underline',
        textUnderlineOffset: '0.2em',
      }),
    ),
    dismiss: component(
      ...quiet,
      Style.self({
        // Inline: at the end of the first line, centered on it.
        gridColumn: '3',
        gridRow: '1',
        marginInlineStart: ref.space.sm,
        marginBlock: `calc((1lh - ${ladder('height')}) / 2)`,
        display: 'grid',
        placeItems: 'center',
        inlineSize: ladder('height'),
        blockSize: ladder('height'),
        padding: '0',
      }),
      Style.nest(inBanner, {
        position: 'absolute',
        insetBlockStart: '50%',
        insetInlineEnd: ref.space.xs,
        translate: '0 -50%',
        margin: '0',
      }),
    ),
  },
  variants: {
    tone: {
      info: { root: toned('info') },
      success: { root: toned('success') },
      warning: { root: toned('warning') },
      error: { root: toned('error') },
    },
    emphasis: {
      subtle: {
        root: variant(
          Style.self({
            background: 'var(--_fk-alert-subtle)',
            color: 'var(--_fk-alert-ink)',
            '--_fk-alert-edge': 'var(--_fk-alert-line)',
          }),
        ),
      },
      bold: {
        root: variant(
          Style.self({
            background: 'var(--_fk-alert-fill)',
            color: 'var(--_fk-alert-on-fill)',
            '--_fk-alert-edge': 'transparent',
          }),
        ),
      },
    },
  },
  defaults: { tone: 'info', emphasis: 'subtle' },
})
