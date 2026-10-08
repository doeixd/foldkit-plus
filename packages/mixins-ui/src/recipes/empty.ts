/**
 * An empty state: centered, muted, and quiet, with the title reading as the
 * heading and the action kept. Nothing here varies by variant; the recipe
 * is the look, chosen once.
 */
import { Style } from 'foldkit-mixins'
import { EmptySlots } from '../empty.js'
import { component, ref } from './design.js'

export const Empty = Style.recipeFor(EmptySlots)({
  base: {
    root: component(
      Style.self({
        display: 'grid',
        justifyItems: 'center',
        gap: ref.space.sm,
        padding: ref.space.xl,
        textAlign: 'center',
      }),
    ),
    icon: component(
      Style.self({
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        inlineSize: '3rem',
        blockSize: '3rem',
        borderRadius: ref.radius.full,
        background: ref.surface.muted,
        color: ref.text.muted,
      }),
    ),
    title: component(
      Style.self({
        margin: '0',
        fontSize: ref.size.lg,
        fontWeight: ref.weight.semibold,
        color: ref.text.overt,
      }),
    ),
    description: component(
      Style.self({
        margin: '0',
        maxWidth: '24rem',
        fontSize: ref.size.sm,
        color: ref.text.muted,
      }),
    ),
    action: component(Style.self({ display: 'contents' })),
  },
})
