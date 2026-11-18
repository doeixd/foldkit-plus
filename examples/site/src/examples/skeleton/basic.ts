import { Recipes, Skeleton, SkeletonSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// A bar of the page's colour, drawn where text will go. The first names the
// whole loading region for a screen reader; the rest are silent.
export default example({
  title: 'Basic',
  slots: SkeletonSlots,
  recipe: Recipes.Skeleton,
  view: ({ style, h }) =>
    h.div(
      [h.Style({ display: 'grid', gap: '0.5rem', inlineSize: 'min(20rem, 100%)' })],
      [
        Skeleton.view({ label: 'Loading the profile', style }, h),
        Skeleton.view({ style }, h),
        Skeleton.view({ style }, h),
      ],
    ),
})
