import { Recipes, Skeleton, SkeletonSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// A paragraph still loading: whole lines, the last one ending early.
export default example({
  title: 'Lines',
  slots: SkeletonSlots,
  recipe: Recipes.Skeleton,
  view: ({ style, h }) =>
    h.div(
      [h.Style({ inlineSize: 'min(24rem, 100%)' })],
      [Skeleton.lines({ lines: 4, label: 'Loading the article', style }, h)],
    ),
})
