/**
 * A frame: a tray holding panels. `variant` is how the tray stands off the
 * page (a muted fill the panels sit on, a line around it, or no tray at all,
 * the panels alone); `spacing` is the tray's padding and the gap between its
 * panels; `radius` is how round the tray is, and its panels follow, one step
 * in so the corners stay concentric. A panel is a surface of its own with a
 * hairline, so what it holds (an Alert, an Accordion item, a row) needs no
 * border of its own.
 */
import { Style } from 'foldkit-mixins'
import { nests, role } from 'foldkit-mixins/theme'
import { FrameSlots } from '../frame.js'
import { component, ref, variant } from './design.js'

const pad = 'var(--_fk-frame-pad)'
const corner = 'var(--_fk-frame-radius)'

const spacing = (space: string) => variant(Style.self({ '--_fk-frame-pad': space }))
const rounded = (radius: string) => variant(Style.self({ '--_fk-frame-radius': radius }))

export const Frame = Style.recipeFor(FrameSlots)({
  base: {
    root: component(
      Style.self({
        display: 'grid',
        gap: pad,
        padding: pad,
        minInlineSize: '0',
        borderRadius: corner,
        // What sits in the tray takes a corner concentric with its own.
        ...nests(corner, pad),
        color: ref.text.default,
      }),
    ),
    header: component(
      Style.self({
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) auto',
        columnGap: ref.space.sm,
        alignItems: 'center',
        paddingInline: ref.space.xs,
      }),
    ),
    title: component(
      Style.self({
        margin: '0',
        gridColumn: '1',
        fontWeight: ref.weight.semibold,
        color: ref.text.overt,
      }),
    ),
    description: component(
      Style.self({ ...role('body'), margin: '0', gridColumn: '1', color: ref.text.muted }),
    ),
    action: component(
      Style.self({
        gridColumn: '2',
        gridRow: '1 / span 2',
        display: 'flex',
        alignItems: 'center',
        gap: ref.space.xs,
      }),
    ),
    panels: component(Style.self({ display: 'grid', gap: pad, minInlineSize: '0' })),
    panel: component(
      Style.self({
        minInlineSize: '0',
        overflow: 'clip',
        borderRadius: `max(${ref.radius.sm}, calc(${corner} - ${pad}))`,
        background: ref.surface.base,
        border: `${ref.border.thin} solid ${ref.outline.subtle}`,
      }),
    ),
    footer: component(
      Style.self({ ...role('caption'), color: ref.text.muted, paddingInline: ref.space.xs }),
    ),
  },
  variants: {
    variant: {
      muted: { root: variant(Style.self({ background: ref.surface.muted })) },
      outline: {
        root: variant(Style.self({ border: `${ref.border.thin} solid ${ref.outline.subtle}` })),
      },
      plain: { root: variant(Style.self({ padding: '0' })) },
    },
    spacing: {
      compact: { root: spacing(ref.space.xs) },
      comfortable: { root: spacing(ref.space.sm) },
      roomy: { root: spacing(ref.space.md) },
    },
    radius: {
      md: { root: rounded(ref.radius.md) },
      lg: { root: rounded(ref.radius.lg) },
      none: { root: rounded('0px') },
    },
  },
  defaults: { variant: 'muted', spacing: 'comfortable', radius: 'lg' },
})
