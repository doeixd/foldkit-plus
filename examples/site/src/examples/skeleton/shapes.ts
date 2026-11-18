import { Recipes, Skeleton, SkeletonSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// The shapes content will take: a person, a card, rows of a table.
export default example({
  title: 'Shapes',
  slots: SkeletonSlots,
  recipe: Recipes.Skeleton,
  view: ({ style, h }) =>
    h.div(
      [h.Style({ display: 'grid', gap: '1.5rem', inlineSize: 'min(24rem, 100%)' })],
      [
        Skeleton.avatarRow({ label: 'Loading the author', style }, h),
        Skeleton.card({ label: 'Loading the post', style }, h),
        h.div(
          [],
          [1, 2, 3].map(() => Skeleton.tableRow({ columns: 4, label: 'Loading a row', style }, h)),
        ),
      ],
    ),
})
