/**
 * An application's frame: the header bar across the top, a side column down
 * the start when there is one, and the main region in what is left. The
 * header and the side column stay in view while the main region scrolls.
 * Below the theme's `md` breakpoint the side column, which a `Sidebar` has
 * turned into its opener, sits at the start of the header's row. The skip link
 * shows only when it is focused. `width: 'contained'` keeps the main region's
 * content to the theme's `page` width, centred.
 */
import { Style } from 'foldkit-mixins'
import { role, Theme } from 'foldkit-mixins/theme'
import { AppShellSlots } from '../appShell.js'
import { component, ref, variant } from './design.js'

const phone = `@media not all and ${Theme.tokens.breakpoint.md}`

export const AppShell = Style.recipeFor(AppShellSlots)({
  base: {
    root: component(
      Style.self({
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr)',
        gridTemplateRows: 'auto 1fr auto',
        gridTemplateAreas: '"header" "main" "footer"',
        minBlockSize: '100dvh',
        background: ref.surface.base,
        color: ref.text.default,
      }),
      Style.nest('&[data-side]', {
        gridTemplateColumns: 'auto minmax(0, 1fr)',
        gridTemplateAreas: '"side header" "side main" "side footer"',
      }),
      Style.at(
        phone,
        Style.nest('&[data-side]', {
          gridTemplateAreas: '"side header" "main main" "footer footer"',
        }),
      ),
    ),
    skip: component(
      Style.self({
        position: 'absolute',
        insetBlockStart: ref.space.xs,
        insetInlineStart: ref.space.xs,
        // Above the header, which it overlaps when shown and which comes after it.
        zIndex: '2',
        paddingBlock: ref.space['2xs'],
        paddingInline: ref.space.sm,
        borderRadius: ref.radius.md,
        background: ref.surface.overt,
        color: ref.text.overt,
        boxShadow: ref.shadow.md,
        ...role('caption'),
        // Out of sight until focused, so a keyboard reaches it first and a pointer never sees it.
        transform: `translateY(calc(-100% - 2 * ${ref.space.xs}))`,
      }),
      Style.nest('&:focus-visible', { transform: 'none' }),
    ),
    header: component(
      Style.self({
        gridArea: 'header',
        position: 'sticky',
        insetBlockStart: '0',
        // Above positioned content in the main region scrolling under it.
        zIndex: '1',
        display: 'flex',
        alignItems: 'center',
        gap: ref.space.sm,
        minBlockSize: '3.5rem',
        paddingInline: ref.space.md,
        borderBlockEnd: `${ref.border.thin} solid ${ref.outline.subtle}`,
        background: ref.surface.base,
      }),
    ),
    brand: component(
      // The brand takes what is left, so the status and the actions sit at the end.
      Style.self({
        display: 'flex',
        alignItems: 'center',
        gap: ref.space.xs,
        minInlineSize: '0',
        marginInlineEnd: 'auto',
      }),
    ),
    mark: component(Style.self({ display: 'inline-flex', flexShrink: '0' })),
    title: component(
      Style.self({
        ...role('subtitle'),
        fontWeight: ref.weight.heading,
        color: ref.text.overt,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }),
    ),
    status: component(Style.self({ display: 'flex', alignItems: 'center', gap: ref.space.xs })),
    actions: component(
      Style.self({ display: 'flex', alignItems: 'center', gap: ref.space.xs, flexShrink: '0' }),
    ),
    side: component(
      Style.self({
        gridArea: 'side',
        position: 'sticky',
        insetBlockStart: '0',
        // As tall as the window and pinned there, so a sidebar's footer stays in view.
        alignSelf: 'start',
        blockSize: '100dvh',
        overflowY: 'auto',
      }),
      Style.at(
        phone,
        Style.self({
          position: 'static',
          alignSelf: 'center',
          blockSize: 'auto',
          paddingInlineStart: ref.space.xs,
          overflow: 'visible',
        }),
      ),
    ),
    main: component(
      Style.self({
        gridArea: 'main',
        minInlineSize: '0',
        padding: ref.space.lg,
      }),
      // Focused by the skip link, not by a person: no ring for that.
      Style.nest('&:focus:not(:focus-visible)', { outline: 'none' }),
      Style.at(phone, Style.self({ padding: ref.space.md })),
    ),
    footer: component(
      Style.self({
        gridArea: 'footer',
        paddingBlock: ref.space.md,
        paddingInline: ref.space.lg,
        borderBlockStart: `${ref.border.thin} solid ${ref.outline.subtle}`,
        ...role('caption'),
        color: ref.text.muted,
      }),
    ),
  },
  variants: {
    width: {
      full: {},
      contained: {
        main: variant(
          Style.self({
            inlineSize: '100%',
            maxInlineSize: ref.width.page,
            marginInline: 'auto',
          }),
        ),
      },
    },
  },
  defaults: { width: 'full' },
})
