/**
 * An avatar: a muted disc with initials, the picture covering it. Loading
 * and failure stay the browser's (the image covers, or its alt reads);
 * sizes are the one axis.
 */
import { Style } from 'foldkit-mixins'
import { AvatarSlots } from '../avatar.js'
import { component, ref, variant } from './design.js'

export const Avatar = Style.recipeFor(AvatarSlots)({
  base: {
    root: component(
      Style.self({
        position: 'relative',
        flex: 'none',
        overflow: 'clip',
        borderRadius: ref.radius.full,
        background: ref.surface.muted,
      }),
    ),
    fallback: component(
      Style.self({
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        inlineSize: '100%',
        blockSize: '100%',
        color: ref.text.muted,
        fontWeight: ref.weight.semibold,
      }),
    ),
    image: component(
      Style.self({
        position: 'absolute',
        inset: '0',
        inlineSize: '100%',
        blockSize: '100%',
        objectFit: 'cover',
      }),
    ),
  },
  variants: {
    size: {
      sm: {
        root: variant(
          Style.self({ inlineSize: '1.5rem', blockSize: '1.5rem', fontSize: ref.size.xs }),
        ),
      },
      md: {
        root: variant(
          Style.self({ inlineSize: '2.5rem', blockSize: '2.5rem', fontSize: ref.size.sm }),
        ),
      },
      lg: {
        root: variant(
          Style.self({ inlineSize: '3.5rem', blockSize: '3.5rem', fontSize: ref.size.md }),
        ),
      },
    },
  },
  defaults: { size: 'md' },
})
