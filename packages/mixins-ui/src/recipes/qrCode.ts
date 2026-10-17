/**
 * A QR code: a square of the code's width, dark modules in the overt text
 * and the quiet zone in the base surface. `scheme: light` (the default)
 * draws it dark on light whatever the page's scheme, because not every
 * scanner reads a light-on-dark code; `page` follows the page. The overlay
 * is a padded tile on the code's own light color, a fifth of its width, so
 * the error correction covers what it hides. `size` sets the width.
 */
import { Style } from 'foldkit-mixins'
import { role } from 'foldkit-mixins/theme'
import { QrCodeSlots } from '../qrCode.js'
import { component, ref, variant } from './design.js'

export const QrCode = Style.recipeFor(QrCodeSlots)({
  base: {
    root: component(
      Style.self({
        position: 'relative',
        display: 'inline-block',
        inlineSize: 'var(--_fk-qr-size)',
        maxInlineSize: '100%',
        '--_fk-qr-size': '12rem',
      }),
    ),
    frame: component(
      Style.self({ display: 'block', inlineSize: '100%', blockSize: 'auto', aspectRatio: '1' }),
    ),
    background: component(Style.self({ fill: ref.surface.base })),
    pattern: component(Style.self({ fill: ref.text.overt })),
    overlay: component(
      Style.self({
        position: 'absolute',
        insetBlockStart: '50%',
        insetInlineStart: '50%',
        translate: '-50% -50%',
        display: 'grid',
        placeItems: 'center',
        inlineSize: '22%',
        aspectRatio: '1',
        padding: '2%',
        boxSizing: 'border-box',
        overflow: 'hidden',
        borderRadius: ref.radius.sm,
        background: ref.surface.base,
      }),
      Style.nest('& > img, & > svg', { inlineSize: '100%', blockSize: '100%' }),
    ),
    fallback: component(Style.self({ ...role('caption'), color: ref.text.muted })),
  },
  variants: {
    scheme: {
      // Inside, `light-dark()` tokens resolve to their light half.
      light: { root: variant(Style.self({ colorScheme: 'light' })) },
      page: {},
    },
    size: {
      sm: { root: variant(Style.self({ '--_fk-qr-size': '8rem' })) },
      md: { root: variant(Style.self({ '--_fk-qr-size': '12rem' })) },
      lg: { root: variant(Style.self({ '--_fk-qr-size': '16rem' })) },
    },
  },
  defaults: { scheme: 'light' },
})
