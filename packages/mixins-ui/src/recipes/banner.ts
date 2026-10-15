/**
 * A banner: a strip the full width of what holds it, its message centered
 * between an icon and an action, a dismiss button at the end. `tone` picks
 * Alert's feedback families; `emphasis` reads one as Alert does (`subtle`,
 * the family's tint and ink, with a hairline below) or as a solid band
 * (`bold`, the fill and the text on it), so the two axes need no compound
 * per pair. The action and the dismiss button take the band's text color and
 * hover with `unfilledHover`, which reads on either.
 */
import { Style, type StyleValue } from 'foldkit-mixins'
import { ladder, role } from 'foldkit-mixins/theme'
import type { AlertTone } from '../alert.js'
import { BannerSlots } from '../banner.js'
import { component, focusRing, ref, transition, unfilledHover, variant } from './design.js'

const toned = (tone: AlertTone): StyleValue =>
  variant(
    Style.self({
      '--_fk-banner-subtle': ref[tone].subtle,
      '--_fk-banner-ink': ref[tone].ink,
      '--_fk-banner-fill': ref[tone].default,
      '--_fk-banner-on-fill': ref[tone]['on-fill'],
      '--_fk-banner-line': ref[tone].outline,
    }),
  )

// What the action and the dismiss button share: no chrome of their own, the band's text.
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

// Room on each side for the dismiss button, held out of the flow so the message stays centered.
const corner = `calc(${ladder('height')} + ${ref.space.sm})`

export const Banner = Style.recipeFor(BannerSlots)({
  base: {
    root: component(
      Style.self({
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexWrap: 'wrap',
        gap: ref.space.sm,
        inlineSize: '100%',
        boxSizing: 'border-box',
        paddingBlock: ref.space.xs,
        paddingInline: corner,
        position: 'relative',
        ...role('body'),
      }),
    ),
    icon: component(Style.self({ display: 'inline-flex', flex: 'none' })),
    message: component(Style.self({ margin: '0', fontWeight: ref.weight.medium })),
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
        position: 'absolute',
        insetBlockStart: '50%',
        insetInlineEnd: ref.space.xs,
        translate: '0 -50%',
        display: 'grid',
        placeItems: 'center',
        inlineSize: ladder('height'),
        blockSize: ladder('height'),
        padding: '0',
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
            background: 'var(--_fk-banner-subtle)',
            color: 'var(--_fk-banner-ink)',
            borderBlockEnd: `${ref.border.thin} solid var(--_fk-banner-line)`,
          }),
        ),
      },
      bold: {
        root: variant(
          Style.self({
            background: 'var(--_fk-banner-fill)',
            color: 'var(--_fk-banner-on-fill)',
          }),
        ),
      },
    },
  },
  defaults: { tone: 'info', emphasis: 'subtle' },
})
