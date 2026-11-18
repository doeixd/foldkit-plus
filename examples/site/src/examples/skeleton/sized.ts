import { Recipes, Skeleton, SkeletonSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// `inline` and `block` are CSS lengths: the size of what is loading, so a
// bar can stand in for a thumbnail or a heading with no style of its own.
export default example({
  title: 'Sized',
  slots: SkeletonSlots,
  recipe: Recipes.Skeleton,
  view: ({ style, h }) =>
    h.div(
      [h.Style({ display: 'grid', gap: '0.75rem', justifyItems: 'start' })],
      [
        Skeleton.view({ label: 'Loading the cover', inline: '12rem', block: '6rem', style }, h),
        Skeleton.view({ inline: '8rem', block: '1.5rem', style }, h),
      ],
    ),
})
