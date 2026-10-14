/**
 * A card and a group of them.
 *
 * A card is a surface whose regions share one padding, `--_fk-card-pad`, so
 * an image can bleed to the edges by undoing it. `orientation` stacks the
 * regions or lays them in a row (the image or media leading, the footer
 * trailing); `surface` is how it stands off the page, `plain` inside a group
 * that draws the frame; `padding` is the one size. A pressable card tints on
 * hover; a selected one keeps a fill and a heavier title.
 *
 * A group lays cards in `--fk-card-columns` columns, divided by hairlines or
 * apart, and draws the one highlight that follows the pointer between them.
 */
import { Style } from 'foldkit-mixins'
import { CardGroupSlots, CardSlots } from '../card.js'
import { component, focusRing, ref, transition, variant } from './design.js'

const pad = 'var(--_fk-card-pad)'
const gap = 'var(--_fk-card-gap)'
const pressableHover = '&[data-pressable="true"]:not([data-disabled="true"]):hover'
const selected = '&[data-selected="true"]'

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
        color: ref.text.default,
        overflow: 'clip',
        ...transition('background-color, box-shadow, opacity'),
      }),
      Style.nest(selected, { background: ref.surface.muted }),
      Style.nest('&[data-disabled="true"]', { opacity: '0.5' }),
    ),
    image: component(
      Style.self({ overflow: 'clip' }),
      Style.nest('& > :is(img, video, svg, picture)', {
        display: 'block',
        inlineSize: '100%',
        blockSize: '100%',
        objectFit: 'cover',
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
    ),
    title: component(
      Style.self({
        gridColumn: '1',
        margin: '0',
        fontSize: ref.size.md,
        fontWeight: ref.weight.medium,
        lineHeight: ref.leading.snug,
        color: ref.text.overt,
        ...transition('font-weight'),
      }),
      Style.nest(':where([data-selected="true"]) &', { fontWeight: ref.weight.semibold }),
    ),
    description: component(
      Style.self({
        gridColumn: '1',
        margin: '0',
        fontSize: ref.size.sm,
        lineHeight: ref.leading.normal,
        color: ref.text.muted,
      }),
    ),
    // Above the overlay, so it stays pressable on a pressable card.
    action: component(
      Style.self({
        gridColumn: '2',
        gridRow: '1 / span 2',
        position: 'relative',
        zIndex: '1',
        display: 'flex',
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
        fontSize: ref.size.xs,
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
        header: variant(Style.self({ gridColumn: '2' })),
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
            background: ref.surface.base,
            border: `${ref.border.thin} solid ${ref.outline.subtle}`,
            boxShadow: ref.shadow.xs,
          }),
          Style.nest(pressableHover, { boxShadow: ref.shadow.md }),
          Style.nest(selected, { borderColor: ref.outline.default }),
        ),
      },
      elevated: {
        root: variant(
          Style.self({ background: ref.surface.base, boxShadow: ref.shadow.md }),
          Style.nest(pressableHover, { boxShadow: ref.shadow.lg }),
        ),
      },
      filled: {
        root: variant(
          Style.self({ background: ref.surface.subtle }),
          Style.nest(pressableHover, { background: ref.surface.muted }),
          Style.nest(selected, { background: ref.surface.default }),
        ),
      },
      // A group's highlight is the hover, so a plain card draws none of its own.
      plain: {
        root: variant(Style.self({ background: 'transparent', borderRadius: ref.radius.md })),
      },
    },
    padding: {
      compact: { root: padding(ref.space.sm, ref.space.xs) },
      comfortable: { root: padding(ref.space.md, ref.space.sm) },
      roomy: { root: padding(ref.space.lg, ref.space.md) },
      flush: { root: padding('0', ref.space.sm) },
    },
  },
  defaults: { orientation: 'stacked', surface: 'outlined', padding: 'comfortable' },
})

const line = `${ref.border.thin} solid ${ref.outline.subtle}`

export const CardGroup = Style.recipeFor(CardGroupSlots)({
  base: {
    root: component(Style.self({ position: 'relative', borderRadius: ref.radius.lg })),
    list: component(
      Style.self({
        display: 'grid',
        gridTemplateColumns: 'repeat(var(--fk-card-columns), minmax(0, 1fr))',
        margin: '0',
        padding: '0',
        listStyle: 'none',
      }),
    ),
    // After the highlight in the page, so each card paints over it.
    item: component(Style.self({ position: 'relative', display: 'grid' })),
    highlight: component(
      Style.self({
        position: 'absolute',
        insetBlockStart: '0',
        insetInlineStart: '0',
        inlineSize: 'var(--fk-card-hover-w)',
        blockSize: 'var(--fk-card-hover-h)',
        translate: 'var(--fk-card-hover-x) var(--fk-card-hover-y)',
        opacity: 'var(--fk-card-hover-shown)',
        borderRadius: ref.radius.md,
        background: ref.surface.subtle,
        pointerEvents: 'none',
        transitionProperty: 'translate, inline-size, block-size, opacity',
        // The place springs, scaled by `-moving` so a highlight appearing lands
        // on its card; the fade does not.
        transitionDuration: `calc(${ref.motion.normal} * var(--fk-card-hover-moving)), calc(${ref.motion.normal} * var(--fk-card-hover-moving)), calc(${ref.motion.normal} * var(--fk-card-hover-moving)), ${ref.motion.fast}`,
        transitionTimingFunction: `${ref.motion.spring}, ${ref.motion.spring}, ${ref.motion.spring}, ${ref.motion.ease}`,
      }),
    ),
  },
  variants: {
    layout: {
      // Hairlines between the cards: above every row but the first, before every column but the first.
      divided: {
        item: variant(
          Style.nest('&:not([data-row="0"])', { borderBlockStart: line }),
          Style.nest('&:not([data-column="0"])', { borderInlineStart: line }),
        ),
      },
      separated: { list: variant(Style.self({ gap: ref.space.sm })) },
    },
    border: {
      none: {},
      outlined: {
        root: variant(
          Style.self({ border: line, background: ref.surface.base, padding: ref.space['2xs'] }),
        ),
      },
    },
  },
  defaults: { layout: 'divided', border: 'none' },
})
