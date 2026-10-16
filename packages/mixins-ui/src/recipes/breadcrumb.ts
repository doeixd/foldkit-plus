/**
 * A breadcrumb trail: the steps in a muted row with a separator between
 * them, the current page in the overt ink. The separator is a pseudo-element
 * off each step after the first, so no step draws its own divider; its shape
 * is the `separator` axis (`slash`, `chevron`, `dot`), and a separator the
 * view draws itself (`data-separator="custom"` on the list) stands in its
 * place. The chevron is drawn in CSS and points the other way right to left.
 */
import { Style, type Declarations } from 'foldkit-mixins'
import { BreadcrumbSlots } from '../breadcrumb.js'
import { component, cornerSides, focusRing, hover, ref, unfilledHover, variant } from './design.js'

const between = '& > li + li::before'

const separatorOf = (declarations: Declarations) => ({
  list: variant(Style.nest(between, declarations)),
})

export const Breadcrumb = Style.recipeFor(BreadcrumbSlots)({
  base: {
    root: component(Style.self({ display: 'block' })),
    list: Style.compose(
      component(
        Style.self({
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: ref.space.xs,
          margin: '0',
          padding: '0',
          listStyle: 'none',
        }),
        // No margin of its own: the step's gap after it is the list's gap before it.
        Style.nest(between, { color: ref.text.muted }),
      ),
      // In the axis's layer, and one attribute more specific, so it beats any separator chosen.
      variant(Style.nest(`&[data-separator="custom"] > li + li::before`, { content: 'none' })),
    ),
    item: component(
      Style.self({ display: 'inline-flex', alignItems: 'center', gap: ref.space.xs }),
    ),
    link: component(
      Style.self({
        display: 'inline-flex',
        alignItems: 'center',
        gap: ref.space['2xs'],
        color: ref.text.muted,
        textDecoration: 'none',
      }),
      Style.pseudo(':hover', { color: ref.text.overt, textDecoration: 'underline' }),
    ),
    current: component(
      Style.self({
        display: 'inline-flex',
        alignItems: 'center',
        gap: ref.space['2xs'],
        color: ref.text.overt,
        fontWeight: ref.weight.medium,
      }),
    ),
    icon: component(
      Style.self({
        display: 'inline-flex',
        flexShrink: '0',
        inlineSize: '1em',
        blockSize: '1em',
      }),
    ),
    separator: component(
      Style.self({ display: 'inline-flex', alignItems: 'center', color: ref.text.muted }),
    ),
    ellipsis: component(
      Style.self({
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minInlineSize: '1.5rem',
        padding: `0 ${ref.space['3xs']}`,
        border: '0',
        borderRadius: ref.radius.sm,
        background: 'transparent',
        color: ref.text.muted,
        font: 'inherit',
        cursor: 'pointer',
      }),
      hover({ background: unfilledHover, color: ref.text.overt }),
      focusRing,
    ),
  },
  variants: {
    separator: {
      slash: separatorOf({ content: '"/"' }),
      chevron: {
        list: variant(
          Style.nest(between, {
            content: '""',
            inlineSize: '0.35em',
            blockSize: '0.35em',
            ...cornerSides(ref.border.thick, 'currentColor'),
            rotate: '-45deg',
          }),
          Style.nest('&:dir(rtl) > li + li::before', { rotate: '135deg' }),
        ),
      },
      dot: separatorOf({
        content: '""',
        inlineSize: '0.25rem',
        blockSize: '0.25rem',
        borderRadius: ref.radius.full,
        background: 'currentColor',
      }),
    },
  },
  defaults: { separator: 'slash' },
})
