/**
 * A card and a group of them.
 *
 * A card is a surface whose regions share one padding, `--_fk-card-pad`, so
 * an image can bleed to the edges by undoing it. `orientation` stacks the
 * regions or lays them in a row (the image or media leading, the footer
 * trailing); `surface` is how it stands off the page, `plain` inside a group
 * that draws the frame; `padding` is the one size. `elevation` (0 to 3) is
 * where an outlined or elevated card sits on the surface ladder: that many
 * levels above what holds it (`Theme.raise`), so on a dark page it is
 * lighter, with a shadow of two layers (a tight contact one and a soft
 * ambient one) that deepens with the level. `lift: 'hover'` raises a
 * pressable card under the pointer, which reduced motion stills. A pressable
 * card tints on hover; a selected one keeps a fill, in each surface, and a
 * heavier title.
 *
 * A group lays cards in up to `--fk-card-columns` columns, fewer where a
 * column would be narrower than `minColumn`, divided by hairlines or apart,
 * and draws the one highlight that follows the pointer between them: a film
 * over the card it is on, which is that card's hover, whatever its surface.
 */
import { Style } from 'foldkit-mixins'
import { nests, raise, raisedSurface, role } from 'foldkit-mixins/theme'
import { Utilities as U } from 'foldkit-mixins/utilities'
import { CardGroupSlots, CardSlots } from '../card.js'
import {
  component,
  focusRing,
  glide,
  imageEdge,
  ref,
  transition,
  travelled,
  variant,
} from './design.js'

const pad = 'var(--_fk-card-pad)'
const gap = 'var(--_fk-card-gap)'
const pressableHover = '&[data-pressable="true"]:not([data-disabled="true"]):is(:hover, :active)'
/** A card's own hover, unless a group's highlight is its hover. */
const ownHover = `${pressableHover}:not([data-card-fluid="true"] [data-card-item] > *)`
const selected = '&[data-selected="true"]'
/** The room the dismiss button takes in the corner, less the card's own padding, and a hair. */
const clearOfDismiss = `calc(1.5rem - ${pad} / 2 + ${ref.space['2xs']})`

/**
 * A film of the card's text over `ground`, `share` of the `state-tint` knob:
 * darker on a light page and lighter on a dark one. A surface step is darker
 * in both schemes, so a chosen card on a dark page read sunken.
 */
const film = (ground: string, share: string) =>
  `color-mix(in oklab, ${ground}, currentColor calc(${ref.knob['state-tint']} * ${share}))`

/**
 * A level of the surface ladder, `offset` above what holds the card, and the
 * shadows that go with it: at rest and lifted, each quiet (for an outlined
 * card, which has its line to stand off by) and full (for an elevated one).
 */
const level = (
  offset: number,
  [quiet, full, quietLifted, fullLifted]: readonly [string, string, string, string],
) =>
  variant(
    raise(offset),
    Style.self({
      '--_fk-card-shadow-quiet': quiet,
      '--_fk-card-shadow': full,
      '--_fk-card-shadow-quiet-lifted': quietLifted,
      '--_fk-card-shadow-lifted': fullLifted,
    }),
  )

/** The padding, and the gap between regions that goes with it. */
const padding = (space: string, between: string) =>
  variant(Style.self({ '--_fk-card-pad': space, '--_fk-card-gap': between }))

export const Card = Style.recipeFor(CardSlots)({
  base: {
    root: component(
      Style.self({
        position: 'relative',
        padding: pad,
        gap,
        borderRadius: ref.radius.lg,
        // A button or a field in it takes a corner concentric with the card's.
        ...nests(ref.radius.lg, pad),
        color: ref.text.default,
        overflow: 'clip',
        ...transition('background-color, box-shadow, opacity'),
      }),
      Style.nest('&[data-disabled="true"]', { opacity: '0.5' }),
    ),
    image: component(
      Style.self({ overflow: 'clip' }),
      Style.nest('& > :is(img, video, svg, picture)', {
        display: 'block',
        inlineSize: '100%',
        blockSize: '100%',
        objectFit: 'cover',
        ...imageEdge,
      }),
    ),
    media: component(
      Style.self({
        display: 'grid',
        placeItems: 'center',
        inlineSize: '2rem',
        blockSize: '2rem',
        flexShrink: '0',
        borderRadius: ref.radius.md,
        background: ref.accent.subtle,
        color: ref.accent.ink,
        overflow: 'clip',
      }),
      Style.nest('& > :is(svg, img)', { inlineSize: '1rem', blockSize: '1rem' }),
    ),
    header: component(
      Style.self({
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) auto',
        columnGap: ref.space.sm,
        rowGap: ref.space['3xs'],
        alignItems: 'start',
      }),
      // Clear of the dismiss button in the corner, action included, where the
      // header is at the top: below an image or a tile it was pushed in for
      // nothing, and a badge in the action floated mid-card.
      Style.nest(':where([data-dismissible="true"]) > &:first-child', {
        paddingInlineEnd: clearOfDismiss,
      }),
    ),
    title: component(
      Style.self({
        gridColumn: '1',
        margin: '0',
        ...role('subtitle'),
        fontWeight: ref.weight.medium,
        color: ref.text.overt,
        ...transition('font-weight'),
      }),
      Style.nest(':where([data-selected="true"]) &', { fontWeight: ref.weight.semibold }),
      // The card writes its title in `data-label`, so turning semibold moves nothing.
      U.steady('semibold'),
    ),
    description: component(
      Style.self({
        gridColumn: '1',
        margin: '0',
        ...role('body'),
        color: ref.text.muted,
      }),
    ),
    // Above the overlay, so it stays pressable on a pressable card. At least
    // the title's line tall, its controls centred in it, so a badge sits on
    // the title's line.
    action: component(
      Style.self({
        gridColumn: '2',
        gridRow: '1 / span 2',
        position: 'relative',
        zIndex: '1',
        display: 'flex',
        alignItems: 'center',
        minBlockSize: role('subtitle').lineHeight,
        gap: ref.space['2xs'],
      }),
    ),
    content: component(Style.self({ display: 'block', minInlineSize: '0' })),
    footer: component(
      Style.self({
        position: 'relative',
        zIndex: '1',
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: ref.space.xs,
      }),
    ),
    overlay: component(
      Style.self({
        position: 'absolute',
        inset: '0',
        margin: '0',
        padding: '0',
        border: '0',
        borderRadius: 'inherit',
        background: 'transparent',
        cursor: 'pointer',
      }),
      Style.pseudo(':is(:disabled, [aria-disabled="true"])', { cursor: 'not-allowed' }),
      focusRing,
      Style.pseudo(':focus-visible', { outlineOffset: '-2px' }),
    ),
    dismiss: component(
      Style.self({
        position: 'absolute',
        insetBlockStart: `calc(${pad} / 2)`,
        insetInlineEnd: `calc(${pad} / 2)`,
        zIndex: '2',
        display: 'grid',
        placeItems: 'center',
        inlineSize: '1.5rem',
        blockSize: '1.5rem',
        padding: '0',
        border: '0',
        borderRadius: ref.radius.full,
        background: 'transparent',
        color: ref.text.muted,
        ...role('caption'),
        cursor: 'pointer',
        ...transition('opacity, background-color, color'),
      }),
      Style.pseudo(':hover', { background: ref.surface.default, color: ref.text.overt }),
      focusRing,
      // Revealed by the card's hover or focus; a touch screen has no hover to reveal it.
      Style.nest('&[data-reveal="hover"]', { opacity: '0' }),
      Style.nest(':is(:hover, :focus-within) > &[data-reveal="hover"]', { opacity: '1' }),
      Style.media('(hover: none)', { opacity: '1' }),
    ),
  },
  variants: {
    orientation: {
      stacked: {
        root: variant(Style.self({ display: 'flex', flexDirection: 'column' })),
        // Back out to the card's edges, with the regions below starting their gap after it.
        image: variant(
          Style.self({
            marginBlockStart: `calc(-1 * ${pad})`,
            marginInline: `calc(-1 * ${pad})`,
            aspectRatio: '16 / 9',
          }),
        ),
      },
      inline: {
        root: variant(
          Style.self({
            display: 'grid',
            gridTemplateColumns: 'auto minmax(0, 1fr) auto',
            alignItems: 'center',
            columnGap: '0',
          }),
        ),
        image: variant(
          Style.self({
            gridColumn: '1',
            gridRow: '1 / span 2',
            inlineSize: '3rem',
            aspectRatio: '1',
            marginInlineEnd: gap,
            borderRadius: ref.radius.md,
            outline: `${ref.border.thin} solid ${ref.outline.subtle}`,
            outlineOffset: `calc(-1 * ${ref.border.thin})`,
          }),
        ),
        media: variant(
          Style.self({ gridColumn: '1', gridRow: '1 / span 2', marginInlineEnd: gap }),
        ),
        // Beside a leading image or tile, the header is at the top as well.
        header: variant(
          Style.self({ gridColumn: '2' }),
          Style.nest(':where([data-dismissible="true"]) > &', {
            paddingInlineEnd: clearOfDismiss,
          }),
        ),
        content: variant(Style.self({ gridColumn: '2' })),
        footer: variant(
          Style.self({
            gridColumn: '3',
            gridRow: '1 / span 2',
            marginInlineStart: gap,
            justifyContent: 'flex-end',
          }),
        ),
      },
    },
    surface: {
      outlined: {
        root: variant(
          Style.self({
            background: raisedSurface(),
            border: `${ref.border.thin} solid ${ref.outline.subtle}`,
            boxShadow: 'var(--_fk-card-shadow-quiet)',
          }),
          Style.nest(ownHover, {
            boxShadow: 'var(--_fk-card-shadow-quiet-lifted)',
            borderColor: ref.outline.default,
          }),
          Style.nest(selected, {
            background: film(raisedSurface(), '0.5'),
            borderColor: ref.outline.default,
          }),
        ),
      },
      elevated: {
        root: variant(
          Style.self({ background: raisedSurface(), boxShadow: 'var(--_fk-card-shadow)' }),
          Style.nest(ownHover, { boxShadow: 'var(--_fk-card-shadow-lifted)' }),
          Style.nest(selected, { background: film(raisedSurface(), '0.5') }),
        ),
      },
      filled: {
        root: variant(
          Style.self({ background: ref.surface.subtle }),
          Style.nest(ownHover, { background: ref.surface.muted }),
          Style.nest(selected, { background: ref.surface.default }),
        ),
      },
      // Chosen, it keeps a film twice its hover's.
      plain: {
        root: variant(
          Style.self({ background: 'transparent', borderRadius: ref.radius.md }),
          Style.nest(ownHover, { background: film('transparent', '0.5') }),
          Style.nest(selected, { background: film('transparent', '1') }),
        ),
      },
    },
    padding: {
      compact: { root: padding(ref.space.sm, ref.space.xs) },
      comfortable: { root: padding(ref.space.md, ref.space.sm) },
      roomy: { root: padding(ref.space.lg, ref.space.md) },
      flush: { root: padding('0', ref.space.sm) },
    },
    // The outlined and elevated surfaces read it; a filled or plain card is flat.
    elevation: {
      '0': { root: level(0, ['none', 'none', ref.shadow.xs, ref.shadow.sm]) },
      '1': { root: level(1, [ref.shadow.xs, ref.shadow.md, ref.shadow.sm, ref.shadow.lg]) },
      '2': { root: level(2, [ref.shadow.sm, ref.shadow.lg, ref.shadow.md, ref.shadow.xl]) },
      '3': { root: level(3, [ref.shadow.md, ref.shadow.xl, ref.shadow.lg, ref.shadow['2xl']]) },
    },
    lift: {
      none: {},
      // The rise is a distance times `travel`, so reduced motion keeps the shadow alone.
      hover: {
        root: variant(
          Style.self({
            transitionProperty: 'background-color, box-shadow, opacity, translate',
            transitionDuration: `${ref.motion.fast}, ${ref.motion.fast}, ${ref.motion.fast}, ${travelled(ref.motion.fast)}`,
          }),
          Style.nest(ownHover, {
            translate: `0 calc(-1 * ${ref.space['3xs']} * ${ref.knob.travel})`,
          }),
        ),
      },
    },
  },
  defaults: {
    orientation: 'stacked',
    surface: 'outlined',
    padding: 'comfortable',
    elevation: '1',
    lift: 'none',
  },
})

const line = `${ref.border.thin} solid ${ref.outline.subtle}`
const groupGap = 'var(--_fk-card-group-gap)'
const minColumn = 'var(--_fk-card-min-column)'
const columns = 'var(--fk-card-columns)'
/** The room `columns` columns at their narrowest take, with the gaps between them and the frame around. */
const narrowest = `calc(${columns} * ${minColumn} + (${columns} - 1) * ${groupGap} + var(--_fk-card-group-frame))`
/** The narrowest a column may be, or none, which keeps every column at any width. */
const minWidth = (width: string) => variant(Style.self({ '--_fk-card-min-column': width }))

export const CardGroup = Style.recipeFor(CardGroupSlots)({
  base: {
    root: component(
      Style.self({
        '--_fk-card-group-gap': '0px',
        '--_fk-card-group-frame': '0px',
        position: 'relative',
        // As wide as its columns at their narrowest, where it can be: a group
        // in a row or a centred box would shrink to one column otherwise.
        minInlineSize: `min(100%, ${narrowest})`,
        borderRadius: ref.radius.lg,
      }),
    ),
    list: component(
      Style.self({
        display: 'grid',
        // At most `columns`, each at least a share of the row and `minColumn`
        // (or the whole row, when that is narrower); fewer as the row narrows.
        gridTemplateColumns: `repeat(auto-fill, minmax(max(min(100%, ${minColumn}), calc((100% - (${columns} - 1) * ${groupGap}) / ${columns})), 1fr))`,
        gap: groupGap,
        margin: '0',
        padding: '0',
        listStyle: 'none',
      }),
    ),
    item: component(Style.self({ position: 'relative', display: 'grid' })),
    highlight: component(
      Style.self({
        position: 'absolute',
        // Over the cards, which the film tints: under one with a surface, it
        // showed only as a rim in the gap around it.
        zIndex: '1',
        // Physical: the Mounts measure from the left, in either direction.
        top: '0',
        left: '0',
        inlineSize: 'var(--fk-card-hover-w)',
        blockSize: 'var(--fk-card-hover-h)',
        translate: 'var(--fk-card-hover-x) var(--fk-card-hover-y)',
        opacity: 'var(--fk-card-hover-shown)',
        // Half a chosen plain card's film, so it lightens a dark page as it
        // darkens a light one; a surface step darkened both.
        background: film('transparent', '0.5'),
        pointerEvents: 'none',
        ...glide('fast', 'var(--fk-card-hover-moving)'),
      }),
    ),
  },
  variants: {
    layout: {
      // Hairlines between the cards: every card draws one above and one before
      // it, a line's width out, and the list clips those of the first row and
      // column, wherever the row wraps.
      divided: {
        list: variant(Style.self({ overflow: 'clip' })),
        item: variant(
          Style.self({
            borderBlockStart: line,
            borderInlineStart: line,
            marginBlockStart: `calc(-1 * ${ref.border.thin})`,
            marginInlineStart: `calc(-1 * ${ref.border.thin})`,
          }),
        ),
        highlight: variant(Style.self({ borderRadius: ref.radius.md })),
      },
      // The highlight takes the corners of a card with a surface.
      separated: {
        root: variant(Style.self({ '--_fk-card-group-gap': ref.space.sm })),
        highlight: variant(Style.self({ borderRadius: ref.radius.lg })),
      },
    },
    minColumn: {
      none: { root: minWidth('0px') },
      sm: { root: minWidth(ref.width['column-sm']) },
      md: { root: minWidth(ref.width['column-md']) },
      lg: { root: minWidth(ref.width['column-lg']) },
    },
    border: {
      none: {},
      outlined: {
        root: variant(
          Style.self({
            '--_fk-card-group-frame': `calc(2 * (${ref.space['2xs']} + ${ref.border.thin}))`,
            border: line,
            background: ref.surface.base,
            padding: ref.space['2xs'],
          }),
        ),
      },
    },
  },
  defaults: { layout: 'divided', minColumn: 'md', border: 'none' },
})
