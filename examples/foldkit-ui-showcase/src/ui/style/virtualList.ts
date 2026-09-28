import { Slots, Style } from 'foldkit-mixins'

import { app, t } from '../../style.js'
import { container, demoSlots, demoStyles, primaryLook } from './shared.js'

/**
 * `foldkit-mixins-ui` has no VirtualList adapter; `@foldkit/ui` takes
 * attributes for its scroll container, which is the page's own Slot, and
 * draws the rows it mounts from the page's own markup.
 */
export const VirtualListPageSlots = Slots.define({
  ...demoSlots,
  demos: container,
  demo: container,
  subsection: container,
  header: container,
  count: container,
  jumpButton: container,
  list: container,
  row: container,
  tallRow: container,
  avatar: container,
  activity: container,
  activityText: container,
  actor: container,
  target: container,
  timeAgo: container,
  summaryTitle: container,
  summaryBody: container,
  artifact: container,
})

const row = Style.self({
  display: 'grid',
  gridTemplateColumns: '2rem 1fr 5rem',
  alignItems: 'center',
  gap: t.space.sm,
  paddingInline: t.space.md,
  borderBottom: `${t.border.thin} solid ${t.outline.subtle}`,
})

/** Tailwind's 500 steps, which upstream colors the avatars with, by `data-color`. */
const avatarColors = {
  rose: 'oklch(64.5% 0.246 16.439)',
  amber: 'oklch(76.9% 0.188 70.08)',
  emerald: 'oklch(69.6% 0.17 162.48)',
  sky: 'oklch(68.5% 0.169 237.323)',
  violet: 'oklch(60.6% 0.25 292.717)',
  fuchsia: 'oklch(66.7% 0.295 322.15)',
  teal: 'oklch(70.4% 0.14 182.503)',
  orange: 'oklch(70.5% 0.213 47.604)',
} as const

export type AvatarColor = keyof typeof avatarColors

export const VirtualListPageStyle = Style.forSlots(VirtualListPageSlots)(
  {
    ...demoStyles,
    demos: Style.self({
      display: 'flex',
      flexDirection: 'column',
      gap: t.space.xl,
      maxWidth: '42rem',
    }),
    demo: Style.self({ display: 'flex', flexDirection: 'column', gap: t.space.md }),
    subsection: Style.compose(demoStyles.section, Style.self({ margin: `${t.space.xs} 0 0` })),
    header: Style.self({
      display: 'flex',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      maxWidth: '42rem',
      fontSize: t.size.sm,
      color: t.text.muted,
    }),
    jumpButton: Style.compose(
      primaryLook,
      Style.self({
        padding: `0.375rem ${t.space.sm}`,
        borderRadius: t.radius.sm,
        fontSize: t.size.sm,
        fontWeight: t.weight.medium,
      }),
    ),
    list: Style.self({
      width: '100%',
      maxWidth: '42rem',
      height: '24rem',
      borderRadius: t.radius.lg,
      background: t.surface.base,
      boxShadow: `0 0 0 1px ${t.outline.subtle}`,
      overscrollBehavior: 'none',
    }),
    row,
    tallRow: Style.compose(row, Style.self({ paddingBlock: t.space.sm })),
    avatar: Style.compose(
      Style.self({
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '1.75rem',
        height: '1.75rem',
        borderRadius: t.radius.full,
        fontSize: t.size.xs,
        fontWeight: t.weight.semibold,
        color: 'white',
      }),
      Style.states(
        Object.fromEntries(
          Object.entries(avatarColors).map(([name, color]) => [name, { background: color }]),
        ),
        'data-color',
      ),
    ),
    activity: Style.self({ minWidth: '0' }),
    activityText: Style.self({
      overflow: 'hidden',
      fontSize: t.size.sm,
      color: t.text.default,
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    }),
    actor: Style.self({ fontWeight: t.weight.semibold, color: t.text.overt }),
    target: Style.self({ fontFamily: t.font.mono, color: t.text.overt }),
    timeAgo: Style.self({
      textAlign: 'right',
      fontSize: t.size.xs,
      fontVariantNumeric: 'tabular-nums',
      color: t.text.muted,
    }),
    summaryTitle: Style.self({
      marginTop: '0.125rem',
      fontSize: t.size.xs,
      fontWeight: t.weight.semibold,
      color: t.text.default,
    }),
    summaryBody: Style.self({
      display: '-webkit-box',
      marginTop: '0.125rem',
      overflow: 'hidden',
      fontSize: t.size.xs,
      lineHeight: t.leading.tight,
      color: t.text.muted,
      WebkitBoxOrient: 'vertical',
      WebkitLineClamp: '1',
    }),
    artifact: Style.self({
      display: 'inline-flex',
      width: 'fit-content',
      marginTop: '0.25rem',
      padding: '0.125rem 0.375rem',
      borderRadius: t.radius.sm,
      background: t.surface.muted,
      fontFamily: t.font.mono,
      fontSize: '10px',
      color: t.text.muted,
    }),
  },
  { name: 'VirtualListPageStyle', layer: app },
)
