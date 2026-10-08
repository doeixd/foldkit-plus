/**
 * A breadcrumb trail: the steps in a muted row with a slash between them,
 * the current page in the overt ink. The separator is a pseudo-element off
 * the list, so no step draws its own divider.
 */
import { Style } from 'foldkit-mixins'
import { BreadcrumbSlots } from '../breadcrumb.js'
import { component, ref, variant } from './design.js'

export const Breadcrumb = Style.recipeFor(BreadcrumbSlots)({
  base: {
    root: component(Style.self({ display: 'block' })),
    list: component(
      Style.self({
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: ref.space.xs,
        margin: '0',
        padding: '0',
        listStyle: 'none',
      }),
      Style.nest('& > li + li::before', {
        content: '"/"',
        marginInlineEnd: ref.space.xs,
        color: ref.text.muted,
      }),
    ),
    item: component(
      Style.self({ display: 'inline-flex', alignItems: 'center', gap: ref.space.xs }),
    ),
    link: component(
      Style.self({ color: ref.text.muted, textDecoration: 'none' }),
      Style.pseudo(':hover', { color: ref.text.overt, textDecoration: 'underline' }),
    ),
    current: component(Style.self({ color: ref.text.overt, fontWeight: ref.weight.medium })),
  },
})
