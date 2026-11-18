import { Recipes, Skeleton, SkeletonSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// A band of the page sweeping across; still under reduced motion.
export default example({
  title: 'Shimmer',
  slots: SkeletonSlots,
  recipe: Recipes.Skeleton,
  pins: { animation: 'shimmer' },
  view: ({ style, h }) =>
    h.div(
      [h.Style({ inlineSize: 'min(24rem, 100%)' })],
      [Skeleton.avatarRow({ label: 'Loading the author', style }, h)],
    ),
})
